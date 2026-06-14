import { ButtonInteraction, MessageFlags } from 'discord.js';
import { attendanceRepository, hifzProgressRepository } from '../../../storage/sqlite';
import { logger, DiscordContext } from '../../../observability/logging/logger';
import { decrementQuranPage, incrementQuranPage } from '../../../shared/quran/pages';
import { TOTAL_QURAN_PAGES } from '../../../shared/quran/progress';
import { syncHifzAttendanceAnnouncementMessage, hifzAttendanceStatuses, HifzAttendanceStatus } from './attendance';
import {
	buildCurrentHifzPagePrompt,
	parseHifzReminderActionCustomId,
	hifzReminderActions,
} from './components';

export async function handleHifzButtonInteraction(interaction: ButtonInteraction): Promise<boolean> {
	const parsedCustomId = parseHifzReminderActionCustomId(interaction.customId);
	if (!parsedCustomId) {
		return false;
	}

	const discordContext = buildDiscordContext(interaction, parsedCustomId.action);

	try {
		switch (parsedCustomId.action) {
			case hifzReminderActions.JOINING_SHORTLY:
				await handleHifzAttendanceSelection(interaction, parsedCustomId.sessionId, hifzAttendanceStatuses.LATE);
				break;
			case hifzReminderActions.CANNOT_MAKE_IT:
				await handleHifzAttendanceSelection(interaction, parsedCustomId.sessionId, hifzAttendanceStatuses.CANNOT_MAKE_IT);
				break;
			case hifzReminderActions.PREVIOUS_QURAN_PAGE:
				await handleHifzPageChange(interaction, parsedCustomId.sessionId, parsedCustomId.page, decrementQuranPage);
				break;
			case hifzReminderActions.NEXT_QURAN_PAGE:
				await handleHifzPageChange(interaction, parsedCustomId.sessionId, parsedCustomId.page, incrementQuranPage);
				break;
		}

		logger.info('Hifz reminder action handled', discordContext, {
			operationType: 'hifz_reminder_action',
			operationStatus: 'success',
			additionalData: { action: parsedCustomId.action, sessionId: parsedCustomId.sessionId },
		});
	} catch (error) {
		logger.error('Failed to handle hifz reminder action', error as Error, discordContext, {
			operationType: 'hifz_reminder_action',
			operationStatus: 'failure',
			additionalData: { action: parsedCustomId.action, sessionId: parsedCustomId.sessionId },
		});
		await replyWithError(interaction);
	}

	return true;
}

async function handleHifzPageChange(interaction: ButtonInteraction, sessionId: string, page: number, getUpdatedPage: (page: number) => number): Promise<void> {
	if (page < 1 || page > TOTAL_QURAN_PAGES) {
		await interaction.reply({ content: 'Quran page must be between 1 and 604.', flags: MessageFlags.Ephemeral });
		return;
	}

	const channel = interaction.message.channel;
	if (!channel?.isSendable()) {
		throw new Error('Hifz reminder action channel is not sendable.');
	}

	await interaction.deferUpdate();

	const progress = await hifzProgressRepository.getProgress();
	if (page !== progress.currentPage) {
		await interaction.message.delete();
		await interaction.followUp({
			content: `That page is no longer the current hifz page. Current page is **${progress.currentPage}**.`,
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	const updatedPage = getUpdatedPage(page);
	await hifzProgressRepository.updateQuranProgress(updatedPage);

	await interaction.message.delete();

	await channel.send(buildCurrentHifzPagePrompt(sessionId, updatedPage));
}

async function handleHifzAttendanceSelection(interaction: ButtonInteraction, sessionId: string, status: HifzAttendanceStatus): Promise<void> {
	await interaction.deferUpdate();

	const existingAttendance = await attendanceRepository.getAttendance(sessionId, interaction.user.id);
	if (existingAttendance?.status === status && existingAttendance.announcedAt) {
		return;
	}

	const channel = interaction.message.channel;
	if (!channel?.isSendable()) {
		throw new Error('Hifz reminder action channel is not sendable.');
	}

	await attendanceRepository.upsertAttendance(sessionId, interaction.user.id, status, null);
	await syncHifzAttendanceAnnouncementMessage(channel, sessionId);
}

function buildDiscordContext(interaction: ButtonInteraction, action: string): DiscordContext {
	return {
		userId: interaction.user.id,
		username: interaction.user.username,
		guildId: interaction.guildId?.toString(),
		channelId: interaction.channelId?.toString(),
		commandName: 'hifz-reminder-action',
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
