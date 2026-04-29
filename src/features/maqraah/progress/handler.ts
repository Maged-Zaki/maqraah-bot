import { MessageFlags } from 'discord.js';
import { configurationRepository, notesRepository, progressRepository } from '../../../storage/sqlite';
import { logger, DiscordContext } from '../../../observability/logging/logger';
import { normalizeTimeZone } from '../../../shared/time';
import { buildCurrentQuranPagePrompt } from '../reminders/components';
import { getReminderSessionId } from '../reminders/sessionId';
import { buildProgressDashboardReply } from './dashboard';
import { progressOptions, progressSubcommands } from './builders';

interface ProgressCommandOptions {
	commandName?: string;
	subcommandGroup?: string | null;
	now?: Date;
}

export async function handleProgressCommand(interaction: any, options: ProgressCommandOptions = {}): Promise<void> {
	const subcommand = interaction.options.getSubcommand();
	const commandName = options.commandName ?? interaction.commandName ?? 'progress';
	const loggedSubcommand = options.subcommandGroup ? `${options.subcommandGroup}.${subcommand}` : subcommand;

	const discordContext: DiscordContext = {
		userId: interaction.user.id,
		username: interaction.user.username,
		guildId: interaction.guildId?.toString(),
		channelId: interaction.channelId?.toString(),
		commandName,
		subcommand: loggedSubcommand,
	};

	logger.info(`Executing progress subcommand: ${loggedSubcommand}`, discordContext, { operationType: 'progress_command' });

	try {
		switch (subcommand) {
			case progressSubcommands.UPDATE:
				await handleProgressUpdate(interaction, discordContext);
				return;
			case progressSubcommands.SHOW:
				await handleProgressShow(interaction, discordContext, options.now);
				return;
			case progressSubcommands.POST_CURRENT_PAGE:
				await handlePostCurrentPage(interaction, discordContext, options.now);
				return;
			default:
				await interaction.reply({ content: 'Unknown progress command.', flags: MessageFlags.Ephemeral });
		}
	} catch (error) {
		logger.error(`Error executing progress subcommand: ${loggedSubcommand}`, error as Error, discordContext, {
			operationType: 'progress_command',
			operationStatus: 'failure',
			additionalData: {
				subcommand: loggedSubcommand,
				userId: interaction.user.id,
				guildId: interaction.guildId?.toString(),
				channelId: interaction.channelId?.toString(),
			},
		});
		await interaction.reply({ content: 'There was an error executing this command!', flags: MessageFlags.Ephemeral });
	}
}

async function handleProgressUpdate(interaction: any, discordContext: DiscordContext): Promise<void> {
	const updates: any = {};
	const replyMessages: string[] = [];

	const currentPage = interaction.options.getInteger(progressOptions.PAGE);
	if (currentPage !== null) {
		if (currentPage < 1 || currentPage > 604) {
			logger.warn(`Invalid Quran page number provided: ${currentPage}`, discordContext, {
				operationType: 'progress_update',
				operationStatus: 'failure',
			});
			await interaction.reply({ content: 'Quran page must be between 1 and 604.', flags: MessageFlags.Ephemeral });
			return;
		}

		updates.currentPage = currentPage;
		replyMessages.push(`Current Qur'an page set to \`${currentPage}\`.`);
	}

	const currentHadith = interaction.options.getInteger(progressOptions.HADITH);
	if (currentHadith !== null) {
		if (currentHadith <= 0) {
			logger.warn(`Invalid Hadith number provided: ${currentHadith}`, discordContext, {
				operationType: 'progress_update',
				operationStatus: 'failure',
			});
			await interaction.reply({ content: 'Hadith number must be a positive integer.', flags: MessageFlags.Ephemeral });
			return;
		}

		updates.currentHadith = currentHadith;
		replyMessages.push(`Current Hadith set to \`${currentHadith}\`.`);
	}

	if (Object.keys(updates).length === 0) {
		logger.info('No progress changes provided', discordContext);
		await interaction.reply({ content: 'No options provided.', flags: MessageFlags.Ephemeral });
		return;
	}

	logger.info('Updating progress with changes', discordContext, { additionalData: { updates } });

	if (currentPage !== null) {
		await progressRepository.updateQuranProgress(currentPage);
	}

	if (currentHadith !== null) {
		await progressRepository.updateProgress({ currentHadith });
	}

	logger.info('Progress updated successfully', discordContext, { operationType: 'progress_update', operationStatus: 'success' });
	await interaction.reply(replyMessages.join('\n'));
}

async function handleProgressShow(interaction: any, discordContext: DiscordContext, now?: Date): Promise<void> {
	const [configuration, progress, notes] = await Promise.all([
		configurationRepository.getConfiguration(),
		progressRepository.getProgress(),
		notesRepository.getNotesByStatus('pending'),
	]);

	logger.info('Displaying current maqraah progress dashboard', discordContext, {
		operationType: 'progress_show',
		operationStatus: 'success',
		additionalData: { progress, pendingNoteCount: notes.length },
	});

	await interaction.reply(
		buildProgressDashboardReply({
			configuration,
			progress,
			pendingNoteCount: notes.length,
			interaction,
			now,
		})
	);
}

async function handlePostCurrentPage(interaction: any, discordContext: DiscordContext, now: Date = new Date()): Promise<void> {
	const channelId = process.env.CHANNEL_ID;
	if (!channelId) {
		await interaction.reply({
			content: 'Reminder channel is not configured. Set CHANNEL_ID before using this command.',
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	const channel = interaction.client?.channels?.cache?.get(channelId);
	if (!isSendableChannel(channel)) {
		await interaction.reply({
			content: `Reminder channel <#${channelId}> was not found or is not sendable.`,
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	const [configuration, progress] = await Promise.all([configurationRepository.getConfiguration(), progressRepository.getProgress()]);
	const timezone = normalizeTimeZone(configuration.timezone);
	if (!timezone) {
		await interaction.reply({
			content: 'The maqraah timezone is not configured correctly.',
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	const sessionId = getReminderSessionId(now, timezone);
	await channel.send(buildCurrentQuranPagePrompt(sessionId, progress.currentPage));

	logger.info('Posted current Quran page prompt', discordContext, {
		operationType: 'progress_post_current_page',
		operationStatus: 'success',
		additionalData: { currentPage: progress.currentPage, sessionId, targetChannelId: channelId },
	});

	await interaction.reply({
		content: `Posted current Qur'an page prompt for page **${progress.currentPage}** in <#${channelId}>.`,
		flags: MessageFlags.Ephemeral,
	});
}

function isSendableChannel(channel: any): channel is { send: (payload: any) => Promise<unknown> } {
	if (!channel || typeof channel.send !== 'function') {
		return false;
	}

	if (typeof channel.isSendable === 'function') {
		return channel.isSendable();
	}

	return true;
}
