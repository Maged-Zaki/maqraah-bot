import { ActionRowBuilder, ButtonInteraction, MessageFlags, ModalBuilder, ModalSubmitInteraction, TextInputBuilder, TextInputStyle } from 'discord.js';
import { attendanceRepository } from '../../infrastructure/database';
import { logger, DiscordContext } from '../../infrastructure/logging/logger';
import {
	JOINING_SHORTLY_MINUTES_INPUT_ID,
	buildJoiningShortlyModalCustomId,
	parseJoiningShortlyModalCustomId,
	parseReminderActionCustomId,
	reminderActions,
} from './components';

export async function handleReminderButtonInteraction(interaction: ButtonInteraction): Promise<boolean> {
	const parsedCustomId = parseReminderActionCustomId(interaction.customId);
	if (!parsedCustomId) {
		return false;
	}

	const discordContext = buildDiscordContext(interaction, parsedCustomId.action);

	try {
		switch (parsedCustomId.action) {
			case reminderActions.JOINING_SHORTLY:
				await showJoiningShortlyModal(interaction, parsedCustomId.sessionId);
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

export async function handleReminderModalSubmit(interaction: ModalSubmitInteraction): Promise<boolean> {
	const sessionId = parseJoiningShortlyModalCustomId(interaction.customId);
	if (!sessionId) {
		return false;
	}

	const discordContext = buildDiscordContext(interaction, 'joining-shortly-minutes');

	try {
		const minutesInput = interaction.fields.getTextInputValue(JOINING_SHORTLY_MINUTES_INPUT_ID).trim();
		const minutesLate = Number(minutesInput);

		if (!Number.isInteger(minutesLate) || minutesLate < 1 || minutesLate > 240) {
			await interaction.reply({ content: 'Please enter a whole number of minutes between 1 and 240.', flags: MessageFlags.Ephemeral });
			return true;
		}

		await attendanceRepository.upsertAttendance(sessionId, interaction.user.id, 'late');
		await interaction.reply({ content: `<@${interaction.user.id}> will join the Maqraah in about ${minutesLate} minute${minutesLate === 1 ? '' : 's'}.` });

		logger.info('Reminder modal handled', discordContext, {
			operationType: 'reminder_action',
			operationStatus: 'success',
			additionalData: { action: 'joining-shortly-minutes', sessionId, minutesLate },
		});
	} catch (error) {
		logger.error('Failed to handle reminder modal', error as Error, discordContext, {
			operationType: 'reminder_action',
			operationStatus: 'failure',
			additionalData: { action: 'joining-shortly-minutes', sessionId },
		});
		await replyWithError(interaction);
	}

	return true;
}

async function showJoiningShortlyModal(interaction: ButtonInteraction, sessionId: string): Promise<void> {
	const minutesInput = new TextInputBuilder()
		.setCustomId(JOINING_SHORTLY_MINUTES_INPUT_ID)
		.setLabel('How many minutes until you join?')
		.setStyle(TextInputStyle.Short)
		.setPlaceholder('Example: 10')
		.setRequired(true)
		.setMinLength(1)
		.setMaxLength(3);

	const modal = new ModalBuilder()
		.setCustomId(buildJoiningShortlyModalCustomId(sessionId))
		.setTitle('Joining shortly')
		.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(minutesInput));

	await interaction.showModal(modal);
}

function buildDiscordContext(interaction: ButtonInteraction | ModalSubmitInteraction, action: string): DiscordContext {
	return {
		userId: interaction.user.id,
		username: interaction.user.username,
		guildId: interaction.guildId?.toString(),
		channelId: interaction.channelId?.toString(),
		commandName: 'reminder-action',
		subcommand: action,
	};
}

async function replyWithError(interaction: ButtonInteraction | ModalSubmitInteraction): Promise<void> {
	const errorReply = { content: 'There was an error handling this reminder action.', flags: MessageFlags.Ephemeral as const };

	if (interaction.replied || interaction.deferred) {
		await interaction.followUp(errorReply);
		return;
	}

	await interaction.reply(errorReply);
}
