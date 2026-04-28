import { ButtonInteraction, MessageFlags } from 'discord.js';
import { attendanceRepository, notesRepository, progressRepository } from '../../../storage/sqlite';
import { logger, DiscordContext } from '../../../observability/logging/logger';
import { decrementQuranPage, incrementQuranPage } from '../../../shared/quran/pages';
import { TOTAL_QURAN_PAGES } from '../../../shared/quran/progress';
import { announceAttendanceStatus, attendanceStatuses, AttendanceStatus } from './attendance';
import {
	buildCurrentQuranPageActionRows,
	buildCurrentQuranPageMessage,
	buildNotesCarryOverActionRows,
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
				await handleAttendanceSelection(interaction, parsedCustomId.sessionId, attendanceStatuses.LATE);
				break;
			case reminderActions.CANNOT_MAKE_IT:
				await handleAttendanceSelection(interaction, parsedCustomId.sessionId, attendanceStatuses.CANNOT_MAKE_IT);
				break;
			case reminderActions.CARRY_OVER_NOTES:
				await carryOverReminderNotes(interaction, parsedCustomId.sessionId);
				break;
			case reminderActions.PREVIOUS_QURAN_PAGE:
				await handleQuranPageChange(interaction, parsedCustomId.sessionId, parsedCustomId.page, decrementQuranPage);
				break;
			case reminderActions.NEXT_QURAN_PAGE:
				await handleQuranPageChange(interaction, parsedCustomId.sessionId, parsedCustomId.page, incrementQuranPage);
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

async function handleQuranPageChange(interaction: ButtonInteraction, sessionId: string, page: number, getUpdatedPage: (page: number) => number): Promise<void> {
	if (page < 1 || page > TOTAL_QURAN_PAGES) {
		await interaction.reply({ content: 'Quran page must be between 1 and 604.', flags: MessageFlags.Ephemeral });
		return;
	}

	const channel = interaction.message.channel;
	if (!channel?.isSendable()) {
		throw new Error('Reminder action channel is not sendable.');
	}

	const progress = await progressRepository.getProgress();
	if (page !== progress.currentPage) {
		await interaction.update({ components: [] });
		await interaction.followUp({
			content: `That page is no longer the current maqraah page. Current page is **${progress.currentPage}**.`,
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	const updatedPage = getUpdatedPage(page);
	await progressRepository.updateQuranProgress(updatedPage);

	await interaction.update({ components: [] });

	await channel.send({
		content: buildCurrentQuranPageMessage(updatedPage),
		components: buildCurrentQuranPageActionRows(sessionId, updatedPage),
		flags: MessageFlags.SuppressEmbeds,
	});
}

async function handleAttendanceSelection(interaction: ButtonInteraction, sessionId: string, status: AttendanceStatus): Promise<void> {
	await interaction.deferUpdate();

	const existingAttendance = await attendanceRepository.getAttendance(sessionId, interaction.user.id);
	if (existingAttendance?.status === status && existingAttendance.announcedAt) {
		return;
	}

	const channel = interaction.message.channel;
	if (!channel?.isSendable()) {
		throw new Error('Reminder action channel is not sendable.');
	}

	await attendanceRepository.upsertAttendance(sessionId, interaction.user.id, status, null);
	await announceAttendanceStatus(channel, sessionId, interaction.user.id, status);
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
	const channel = interaction.message.channel;
	if (!channel?.isSendable()) {
		throw new Error('Reminder action channel is not sendable.');
	}
	await channel.send({ content: `تم ترحيل ${notes.length} ملاحظة لمقراة بكرة إن شاء الله.` });

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
