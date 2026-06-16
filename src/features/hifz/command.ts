import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { attendanceRepository, configurationRepository, reminderEventsRepository } from '../../storage/sqlite';
import { logger, DiscordContext } from '../../observability/logging/logger';
import { addHifzProgressSubcommands, hifzProgressCommandGroup } from './progress/builders';
import { handleHifzProgressCommand } from './progress/handler';
import { addHifzConfigurationSubcommands, handleHifzConfigurationCommand, hifzConfigurationGroup } from './configurationCommand';
import { hifzAttendanceStatuses } from './reminders/attendance';
import { defaultHifzCadence, isHifzReminderStageEnabled, hifzReminderStages } from './reminders/cadence';
import { isHifzEnabled } from './reminders/hifzTimeSync';
import { getUpcomingHifzSessionId } from './reminders/sessionId';

const subcommands = {
	CANNOT_ATTEND: 'cannot-attend-upcoming-hifz',
	WILL_BE_LATE: 'will-be-late-upcoming-hifz',
	CLEAR_STATUS: 'clear-upcoming-hifz-status',
} as const;

export const data = new SlashCommandBuilder()
	.setName('hifz')
	.setDescription('Manage upcoming hifz (memorization) attendance')
	.addSubcommand((subcommand) => subcommand.setName(subcommands.CANNOT_ATTEND).setDescription('Preregister that you cannot attend the upcoming hifz'))
	.addSubcommand((subcommand) => subcommand.setName(subcommands.WILL_BE_LATE).setDescription('Preregister that you will be late to the upcoming hifz'))
	.addSubcommand((subcommand) => subcommand.setName(subcommands.CLEAR_STATUS).setDescription('Clear your preregistered status for the upcoming hifz'))
	.addSubcommandGroup((group) => addHifzProgressSubcommands(group.setName(hifzProgressCommandGroup).setDescription('Manage hifz memorization progress')))
	.addSubcommandGroup((group) => addHifzConfigurationSubcommands(group.setName(hifzConfigurationGroup).setDescription('Manage hifz configuration')));

export async function execute(interaction: any) {
	await handleHifzCommand(interaction);
}

export async function handleHifzCommand(interaction: any, now: Date = new Date()): Promise<void> {
	const subcommandGroup = typeof interaction.options.getSubcommandGroup === 'function' ? interaction.options.getSubcommandGroup(false) : null;
	const subcommand = interaction.options.getSubcommand();

	if (subcommandGroup === hifzProgressCommandGroup) {
		await handleHifzProgressCommand(interaction, { commandName: 'hifz', subcommandGroup, now });
		return;
	}

	if (subcommandGroup === hifzConfigurationGroup) {
		await handleHifzConfigurationCommand(interaction);
		return;
	}

	const discordContext: DiscordContext = {
		userId: interaction.user.id,
		username: interaction.user.username,
		guildId: interaction.guildId?.toString(),
		channelId: interaction.channelId?.toString(),
		commandName: 'hifz',
		subcommand,
	};

	logger.info(`Executing hifz subcommand: ${subcommand}`, discordContext, { operationType: 'hifz_command' });

	try {
		const configuration = await configurationRepository.getConfiguration();
		if (!isHifzEnabled(configuration)) {
			await interaction.reply({
				content: 'Hifz is currently disabled. Enable it with `/hifz configuration update hifz-enabled: true`.',
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		if (!isHifzReminderStageEnabled(configuration.hifzPreReminderEnabled, defaultHifzCadence.preReminderEnabled)) {
			await interaction.reply({
				content: 'Pre-reminders are disabled right now, so preregistering for the upcoming hifz is unavailable.',
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const upcomingSessionId = getUpcomingHifzSessionId(configuration, now);
		if (!upcomingSessionId) {
			await interaction.reply({
				content: 'The hifz time or timezone is not configured correctly yet.',
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		if (await reminderEventsRepository.hasSentEvent(upcomingSessionId, hifzReminderStages.PRE)) {
			await interaction.reply({
				content: 'The pre-hifz reminder for that session has already been sent. Please use the reminder buttons instead.',
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		switch (subcommand) {
			case subcommands.CANNOT_ATTEND:
				await attendanceRepository.upsertAttendance(upcomingSessionId, interaction.user.id, hifzAttendanceStatuses.CANNOT_MAKE_IT, null);
				await interaction.reply({
					content: 'You are marked as unable to attend the upcoming hifz.',
					flags: MessageFlags.Ephemeral,
				});
				return;
			case subcommands.WILL_BE_LATE:
				await attendanceRepository.upsertAttendance(upcomingSessionId, interaction.user.id, hifzAttendanceStatuses.LATE, null);
				await interaction.reply({
					content: 'You are marked as arriving late for the upcoming hifz.',
					flags: MessageFlags.Ephemeral,
				});
				return;
			case subcommands.CLEAR_STATUS: {
				const deleted = await attendanceRepository.deleteAttendance(upcomingSessionId, interaction.user.id);
				await interaction.reply({
					content: deleted
						? 'Your upcoming hifz preregistration was cleared.'
						: 'You do not have a saved upcoming hifz preregistration.',
					flags: MessageFlags.Ephemeral,
				});
				return;
			}
			default:
				await interaction.reply({
					content: 'Unknown hifz command.',
					flags: MessageFlags.Ephemeral,
				});
		}
	} catch (error) {
		logger.error(`Error executing hifz subcommand: ${subcommand}`, error as Error, discordContext, {
			operationType: 'hifz_command',
			operationStatus: 'failure',
			additionalData: { subcommand },
		});
		await interaction.reply({ content: 'There was an error executing this command!', flags: MessageFlags.Ephemeral });
	}
}
