import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { attendanceRepository, configurationRepository, reminderEventsRepository } from '../../storage/sqlite';
import { logger, DiscordContext } from '../../observability/logging/logger';
import { addProgressSubcommands, progressCommandGroup } from './progress/builders';
import { handleProgressCommand } from './progress/handler';
import { addMaqraahConfigurationSubcommands, handleMaqraahConfigurationCommand, maqraahConfigurationGroup } from './configurationCommand';
import { attendanceStatuses, syncAttendanceAnnouncementMessage, type AttendanceAnnouncementChannel } from './reminders/attendance';
import { defaultReminderCadence, isReminderStageEnabled, reminderStages } from './reminders/cadence';
import { getUpcomingSessionId } from './reminders/sessionId';
import { parseIsoDateList } from '../../shared/isoDates';

const subcommands = {
	CANNOT_ATTEND: 'cannot-attend-upcoming-maqraah',
	WILL_BE_LATE: 'will-be-late-upcoming-maqraah',
	CLEAR_STATUS: 'clear-upcoming-maqraah-status',
} as const;

const options = {
	DATES: 'dates',
	USER: 'user',
	SEND_NOW: 'send-now',
} as const;

const announcementOutcomes = {
	POSTED: 'posted',
	ALREADY: 'already',
	FAILED: 'failed',
} as const;

type AnnouncementOutcome = (typeof announcementOutcomes)[keyof typeof announcementOutcomes];

interface TargetSessionIds {
	sessionIds: string[];
	hasExplicitDates: boolean;
	error?: string;
}

interface AttendanceTarget {
	userId: string;
	isSelf: boolean;
}

export const data = new SlashCommandBuilder()
	.setName('maqraah')
	.setDescription('Manage upcoming maqraah attendance')
	.addSubcommand((subcommand) =>
		subcommand
			.setName(subcommands.CANNOT_ATTEND)
			.setDescription('Preregister that you or another member cannot attend the upcoming maqraah')
			.addStringOption((option) => option.setName(options.DATES).setDescription('Maqraah dates in YYYY-MM-DD, comma-separated'))
			.addUserOption((option) => option.setName(options.USER).setDescription('Member who cannot attend (defaults to you)'))
			.addBooleanOption((option) => option.setName(options.SEND_NOW).setDescription('Post the attendance update right away'))
	)
	.addSubcommand((subcommand) => subcommand.setName(subcommands.WILL_BE_LATE).setDescription('Preregister that you will be late to the upcoming maqraah'))
	.addSubcommand((subcommand) =>
		subcommand
			.setName(subcommands.CLEAR_STATUS)
			.setDescription('Clear your preregistered status for the upcoming maqraah')
			.addStringOption((option) => option.setName(options.DATES).setDescription('Maqraah dates in YYYY-MM-DD, comma-separated'))
	)
	.addSubcommandGroup((group) => addProgressSubcommands(group.setName(progressCommandGroup).setDescription('Manage maqraah reading progress')))
	.addSubcommandGroup((group) => addMaqraahConfigurationSubcommands(group.setName(maqraahConfigurationGroup).setDescription('Manage maqraah configuration')));

export async function execute(interaction: any) {
	await handleMaqraahCommand(interaction);
}

export async function handleMaqraahCommand(interaction: any, now: Date = new Date()): Promise<void> {
	const subcommandGroup = typeof interaction.options.getSubcommandGroup === 'function' ? interaction.options.getSubcommandGroup(false) : null;
	const subcommand = interaction.options.getSubcommand();

	if (subcommandGroup === progressCommandGroup) {
		await handleProgressCommand(interaction, { commandName: 'maqraah', subcommandGroup, now });
		return;
	}

	if (subcommandGroup === maqraahConfigurationGroup) {
		await handleMaqraahConfigurationCommand(interaction);
		return;
	}

	const discordContext: DiscordContext = {
		userId: interaction.user.id,
		username: interaction.user.username,
		guildId: interaction.guildId?.toString(),
		channelId: interaction.channelId?.toString(),
		commandName: 'maqraah',
		subcommand,
	};

	logger.info(`Executing maqraah subcommand: ${subcommand}`, discordContext, { operationType: 'maqraah_command' });

	try {
		const configuration = await configurationRepository.getConfiguration();
		if (!isReminderStageEnabled(configuration.preReminderEnabled, defaultReminderCadence.preReminderEnabled)) {
			await interaction.reply({
				content: 'Pre-reminders are disabled right now, so preregistering for the upcoming maqraah is unavailable.',
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const upcomingSessionId = getUpcomingSessionId(configuration, now);
		if (!upcomingSessionId) {
			await interaction.reply({
				content: 'The maqraah time or timezone is not configured correctly yet.',
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const targetSessionIds = getTargetSessionIds(interaction, subcommand, upcomingSessionId);
		if (targetSessionIds.error) {
			await interaction.reply({
				content: targetSessionIds.error,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const target = getAttendanceTarget(interaction);
		const sendNow = subcommand === subcommands.CANNOT_ATTEND && getBooleanOption(interaction, options.SEND_NOW) === true;

		const sentPreReminderSessionIds: string[] = [];
		for (const sessionId of targetSessionIds.sessionIds) {
			if (await reminderEventsRepository.hasSentEvent(sessionId, reminderStages.PRE)) {
				sentPreReminderSessionIds.push(sessionId);
			}
		}

		if (!sendNow && sentPreReminderSessionIds.length > 0) {
			await interaction.reply({
				content: buildPreReminderAlreadySentMessage(sentPreReminderSessionIds, targetSessionIds.hasExplicitDates, target.isSelf),
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		switch (subcommand) {
			case subcommands.CANNOT_ATTEND: {
				const outcomes = new Set<AnnouncementOutcome>();
				for (const sessionId of targetSessionIds.sessionIds) {
					const existingAttendance = await attendanceRepository.getAttendance(sessionId, target.userId);
					const alreadyAnnounced = existingAttendance?.status === attendanceStatuses.CANNOT_MAKE_IT && Boolean(existingAttendance.announcedAt);

					await attendanceRepository.upsertAttendance(sessionId, target.userId, attendanceStatuses.CANNOT_MAKE_IT, null);

					if (!sendNow) {
						continue;
					}

					if (alreadyAnnounced) {
						outcomes.add(announcementOutcomes.ALREADY);
						continue;
					}

					outcomes.add(await announceMaqraahAbsence(interaction, sessionId, discordContext));
				}

				await interaction.reply({
					content: buildCannotAttendMessage(
						target,
						targetSessionIds.sessionIds,
						targetSessionIds.hasExplicitDates,
						sendNow ? outcomes : null
					),
					flags: MessageFlags.Ephemeral,
				});
				return;
			}
			case subcommands.WILL_BE_LATE:
				await attendanceRepository.upsertAttendance(upcomingSessionId, interaction.user.id, attendanceStatuses.LATE, null);
				await interaction.reply({
					content: 'You are marked as arriving late for the upcoming maqraah.',
					flags: MessageFlags.Ephemeral,
				});
				return;
			case subcommands.CLEAR_STATUS: {
				const clearedSessionIds: string[] = [];
				const missingSessionIds: string[] = [];
				for (const sessionId of targetSessionIds.sessionIds) {
					const deleted = await attendanceRepository.deleteAttendance(sessionId, interaction.user.id);
					if (deleted) {
						clearedSessionIds.push(sessionId);
					} else {
						missingSessionIds.push(sessionId);
					}
				}
				await interaction.reply({
					content: targetSessionIds.hasExplicitDates
						? buildExplicitClearStatusMessage(clearedSessionIds, missingSessionIds)
						: clearedSessionIds.length > 0
							? 'Your upcoming maqraah preregistration was cleared.'
							: 'You do not have a saved upcoming maqraah preregistration.',
					flags: MessageFlags.Ephemeral,
				});
				return;
			}
			default:
				await interaction.reply({
					content: 'Unknown maqraah command.',
					flags: MessageFlags.Ephemeral,
				});
		}
	} catch (error) {
		logger.error(`Error executing maqraah subcommand: ${subcommand}`, error as Error, discordContext, {
			operationType: 'maqraah_command',
			operationStatus: 'failure',
			additionalData: { subcommand },
		});
		await interaction.reply({ content: 'There was an error executing this command!', flags: MessageFlags.Ephemeral });
	}
}

function getTargetSessionIds(interaction: any, subcommand: string, upcomingSessionId: string): TargetSessionIds {
	if (subcommand !== subcommands.CANNOT_ATTEND && subcommand !== subcommands.CLEAR_STATUS) {
		return { sessionIds: [upcomingSessionId], hasExplicitDates: false };
	}

	const parsedDates = parseIsoDateList(getStringOption(interaction, options.DATES));
	if (parsedDates.error) {
		return { sessionIds: [], hasExplicitDates: parsedDates.hasInput, error: parsedDates.error };
	}

	if (!parsedDates.hasInput) {
		return { sessionIds: [upcomingSessionId], hasExplicitDates: false };
	}

	const pastDates = parsedDates.dates.filter((date) => date < upcomingSessionId);
	if (pastDates.length > 0) {
		return {
			sessionIds: [],
			hasExplicitDates: true,
			error: `Dates must be on or after the upcoming maqraah date (${upcomingSessionId}).`,
		};
	}

	return { sessionIds: parsedDates.dates, hasExplicitDates: true };
}

function getStringOption(interaction: any, optionName: string): string | null {
	if (typeof interaction.options.getString !== 'function') {
		return null;
	}

	return interaction.options.getString(optionName);
}

function getAttendanceTarget(interaction: any): AttendanceTarget {
	const pickedUser = typeof interaction.options.getUser === 'function' ? interaction.options.getUser(options.USER) : null;

	if (pickedUser?.id && pickedUser.id !== interaction.user.id) {
		return { userId: pickedUser.id, isSelf: false };
	}

	return { userId: interaction.user.id, isSelf: true };
}

function getBooleanOption(interaction: any, optionName: string): boolean | null {
	if (typeof interaction.options.getBoolean !== 'function') {
		return null;
	}

	const value = interaction.options.getBoolean(optionName);
	return typeof value === 'boolean' ? value : null;
}

function getAttendanceAnnouncementChannel(interaction: any): AttendanceAnnouncementChannel | null {
	const channelId = process.env.CHANNEL_ID;
	if (!channelId) {
		return null;
	}

	const channel = interaction.client?.channels?.cache?.get?.(channelId);
	if (!channel || typeof channel.send !== 'function') {
		return null;
	}

	return channel as AttendanceAnnouncementChannel;
}

async function announceMaqraahAbsence(interaction: any, sessionId: string, discordContext: DiscordContext): Promise<AnnouncementOutcome> {
	const channel = getAttendanceAnnouncementChannel(interaction);
	if (!channel) {
		logger.warn('Reminder channel unavailable while announcing maqraah absence', discordContext, {
			operationType: 'maqraah_command',
			additionalData: { channelId: process.env.CHANNEL_ID, sessionId },
		});
		return announcementOutcomes.FAILED;
	}

	try {
		await syncAttendanceAnnouncementMessage(channel, sessionId);
		return announcementOutcomes.POSTED;
	} catch (error) {
		logger.error('Failed to announce maqraah absence', error as Error, discordContext, {
			operationType: 'maqraah_command',
			operationStatus: 'failure',
			additionalData: { sessionId },
		});
		return announcementOutcomes.FAILED;
	}
}

function buildCannotAttendMessage(
	target: AttendanceTarget,
	sessionIds: string[],
	hasExplicitDates: boolean,
	outcomes: Set<AnnouncementOutcome> | null
): string {
	const subject = target.isSelf ? 'You are' : `<@${target.userId}> is`;
	const lines = [
		hasExplicitDates
			? `${subject} marked as unable to attend these maqraah dates: ${formatSessionIdList(sessionIds)}.`
			: `${subject} marked as unable to attend the upcoming maqraah.`,
	];

	if (!outcomes) {
		return lines.join('\n');
	}

	if (outcomes.has(announcementOutcomes.FAILED)) {
		lines.push('The absence was saved, but posting the attendance update failed.');
	}

	if (outcomes.has(announcementOutcomes.POSTED)) {
		lines.push('The attendance update was posted in the reminder channel.');
	} else if (outcomes.has(announcementOutcomes.ALREADY)) {
		lines.push('The attendance update was already posted.');
	}

	return lines.join('\n');
}

function buildPreReminderAlreadySentMessage(sessionIds: string[], hasExplicitDates: boolean, isSelf: boolean): string {
	const hint = isSelf
		? 'Please use the reminder buttons instead.'
		: 'Rerun this command with send-now enabled to announce it now.';

	if (!hasExplicitDates) {
		return `The pre-maqraah reminder for that session has already been sent. ${hint}`;
	}

	return `The pre-maqraah reminder has already been sent for: ${formatSessionIdList(sessionIds)}. ${hint}`;
}

function buildExplicitClearStatusMessage(clearedSessionIds: string[], missingSessionIds: string[]): string {
	if (clearedSessionIds.length === 0) {
		return `No saved maqraah preregistration found for: ${formatSessionIdList(missingSessionIds)}.`;
	}

	if (missingSessionIds.length === 0) {
		return `Cleared your maqraah preregistration for: ${formatSessionIdList(clearedSessionIds)}.`;
	}

	return [
		`Cleared your maqraah preregistration for: ${formatSessionIdList(clearedSessionIds)}.`,
		`No saved preregistration found for: ${formatSessionIdList(missingSessionIds)}.`,
	].join('\n');
}

function formatSessionIdList(sessionIds: string[]): string {
	return sessionIds.join(', ');
}
