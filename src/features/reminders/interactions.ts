import { ButtonInteraction, MessageFlags } from 'discord.js';
import { attendanceRepository } from '../../infrastructure/database';
import { logger, DiscordContext } from '../../infrastructure/logging/logger';
import { parseReminderActionCustomId, reminderActions } from './components';

export async function handleReminderButtonInteraction(interaction: ButtonInteraction): Promise<boolean> {
	const parsedCustomId = parseReminderActionCustomId(interaction.customId);
	if (!parsedCustomId) {
		return false;
	}

	const discordContext = buildDiscordContext(interaction, parsedCustomId.action);

	try {
		switch (parsedCustomId.action) {
			case reminderActions.JOINING_SHORTLY:
				await attendanceRepository.upsertAttendance(parsedCustomId.sessionId, interaction.user.id, 'late');
				await interaction.reply({ content: `<@${interaction.user.id}> هيتأخر شوية عن المقراة.` });
				break;
			case reminderActions.CANNOT_MAKE_IT:
				await attendanceRepository.upsertAttendance(parsedCustomId.sessionId, interaction.user.id, 'cannot_make_it');
				await interaction.reply({ content: `<@${interaction.user.id}> مش هيقدر يحضر المقراة النهارده.` });
				break;
		}

		logger.info('Reminder action handled', discordContext, {
			operationType: 'reminder_action',
			operationStatus: 'success',
			additionalData: { action: parsedCustomId.action, sessionId: parsedCustomId.sessionId },
		});
	} catch (error) {
		logger.error('Failed to handle reminder action', error as Error, discordContext, {
			operationType: 'reminder_action',
			operationStatus: 'failure',
			additionalData: { action: parsedCustomId.action, sessionId: parsedCustomId.sessionId },
		});
		await replyWithError(interaction);
	}

	return true;
}

function buildDiscordContext(interaction: ButtonInteraction, action: string): DiscordContext {
	return {
		userId: interaction.user.id,
		username: interaction.user.username,
		guildId: interaction.guildId?.toString(),
		channelId: interaction.channelId?.toString(),
		commandName: 'reminder-action',
		subcommand: action,
	};
}

async function replyWithError(interaction: ButtonInteraction): Promise<void> {
	const errorReply = { content: 'حصلت مشكلة وأنا بنفذ الاختيار ده.', flags: MessageFlags.Ephemeral as const };

	if (interaction.replied || interaction.deferred) {
		await interaction.followUp(errorReply);
		return;
	}

	await interaction.reply(errorReply);
}
