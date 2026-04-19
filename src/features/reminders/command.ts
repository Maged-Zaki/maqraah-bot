import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { attendanceRepository, configurationRepository, reminderEventsRepository } from '../../storage/sqlite';
import { logger, DiscordContext } from '../../observability/logging/logger';
import { attendanceStatuses } from './attendance';
import { defaultReminderCadence, isReminderStageEnabled, reminderStages } from './cadence';
import { getUpcomingSessionId } from './sessionId';

const subcommands = {
	CANNOT_ATTEND: 'cannot-attend-upcoming-maqraah',
	WILL_BE_LATE: 'will-be-late-upcoming-maqraah',
	CLEAR_STATUS: 'clear-upcoming-maqraah-status',
} as const;

export const data = new SlashCommandBuilder()
	.setName('maqraah')
	.setDescription('Manage upcoming maqraah attendance')
	.addSubcommand((subcommand) => subcommand.setName(subcommands.CANNOT_ATTEND).setDescription('Preregister that you cannot attend the upcoming maqraah'))
	.addSubcommand((subcommand) => subcommand.setName(subcommands.WILL_BE_LATE).setDescription('Preregister that you will be late to the upcoming maqraah'))
	.addSubcommand((subcommand) => subcommand.setName(subcommands.CLEAR_STATUS).setDescription('Clear your preregistered status for the upcoming maqraah'));

export async function execute(interaction: any) {
	await handleMaqraahCommand(interaction);
}

export async function handleMaqraahCommand(interaction: any, now: Date = new Date()): Promise<void> {
	const subcommand = interaction.options.getSubcommand();

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

		const sessionId = getUpcomingSessionId(configuration, now);
		if (!sessionId) {
			await interaction.reply({
				content: 'The maqraah time or timezone is not configured correctly yet.',
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const preReminderAlreadySent = await reminderEventsRepository.hasSentEvent(sessionId, reminderStages.PRE);
		if (preReminderAlreadySent) {
			await interaction.reply({
				content: 'The pre-maqraah reminder for that session has already been sent. Please use the reminder buttons instead.',
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		switch (subcommand) {
			case subcommands.CANNOT_ATTEND:
				await attendanceRepository.upsertAttendance(sessionId, interaction.user.id, attendanceStatuses.CANNOT_MAKE_IT, null);
				await interaction.reply({
					content: 'You are marked as unable to attend the upcoming maqraah.',
					flags: MessageFlags.Ephemeral,
				});
				return;
			case subcommands.WILL_BE_LATE:
				await attendanceRepository.upsertAttendance(sessionId, interaction.user.id, attendanceStatuses.LATE, null);
				await interaction.reply({
					content: 'You are marked as arriving late for the upcoming maqraah.',
					flags: MessageFlags.Ephemeral,
				});
				return;
			case subcommands.CLEAR_STATUS: {
				const deleted = await attendanceRepository.deleteAttendance(sessionId, interaction.user.id);
				await interaction.reply({
					content: deleted
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
