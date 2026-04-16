import { ButtonInteraction, MessageFlags } from 'discord.js';
import { attendanceRepository, notesRepository } from '../../storage/sqlite';
import { logger, DiscordContext } from '../../observability/logging/logger';
import { buildNotesCarryOverActionRows, parseReminderActionCustomId, reminderActions } from './components';

export async function handleReminderButtonInteraction(interaction: ButtonInteraction): Promise<boolean> {
	const parsedCustomId = parseReminderActionCustomId(interaction.customId);
	if (!parsedCustomId) {
		return false;
	}

	const discordContext = buildDiscordContext(interaction, parsedCustomId.action);

	try {
		switch (parsedCustomId.action) {
			case reminderActions.JOINING_SHORTLY:
				await interaction.deferUpdate();
				await attendanceRepository.upsertAttendance(parsedCustomId.sessionId, interaction.user.id, 'late');
				await sendChannelMessage(interaction, `<@${interaction.user.id}> هيتأخر شوية عن المقراة.`);
				break;
			case reminderActions.CANNOT_MAKE_IT:
				await interaction.deferUpdate();
				await attendanceRepository.upsertAttendance(parsedCustomId.sessionId, interaction.user.id, 'cannot_make_it');
				await sendChannelMessage(interaction, `<@${interaction.user.id}> مش هيقدر يحضر المقراة النهارده.`);
				break;
			case reminderActions.CARRY_OVER_NOTES:
				await carryOverReminderNotes(interaction, parsedCustomId.sessionId);
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

async function sendChannelMessage(interaction: ButtonInteraction, content: string): Promise<void> {
	const channel = interaction.message.channel;
	if (!channel.isSendable()) {
		throw new Error('Reminder action channel is not sendable.');
	}

	await channel.send({ content });
}

async function carryOverReminderNotes(interaction: ButtonInteraction, sessionId: string): Promise<void> {
	const notes = await notesRepository.getIncludedNotesBySessionId(sessionId);

	if (notes.length === 0) {
		await interaction.reply({
			content: 'مفيش ملاحظات محتاجة تترحّل من المقراة دي.',
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	const noteIds = notes.map((note) => note.id);
	await notesRepository.carryOverNotes(noteIds);

	await interaction.update({
		components: buildNotesCarryOverActionRows(sessionId, true),
	});
	await sendChannelMessage(interaction, `تم ترحيل ${notes.length} ملاحظة لمقراة بكرة إن شاء الله.`);

	logger.recordNoteEvent({
		userId: interaction.user.id,
		username: interaction.user.username,
		guildId: interaction.guildId?.toString(),
		channelId: interaction.channelId?.toString(),
		noteCount: notes.length,
		noteIds,
		operation: 'carried_over',
	});
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
