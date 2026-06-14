import { MessageFlags } from 'discord.js';
import { configurationRepository, hifzProgressRepository, notesRepository } from '../../../storage/sqlite';
import { logger, DiscordContext } from '../../../observability/logging/logger';
import { normalizeTimeZone } from '../../../shared/time';
import { buildCurrentHifzPagePrompt } from '../reminders/components';
import { getHifzReminderSessionId } from '../reminders/sessionId';
import { buildHifzProgressDashboardReply } from './dashboard';
import { hifzProgressOptions, hifzProgressSubcommands } from './builders';

interface HifzProgressCommandOptions {
	commandName?: string;
	subcommandGroup?: string | null;
	now?: Date;
}

export async function handleHifzProgressCommand(interaction: any, options: HifzProgressCommandOptions = {}): Promise<void> {
	const subcommand = interaction.options.getSubcommand();
	const commandName = options.commandName ?? interaction.commandName ?? 'hifz';
	const loggedSubcommand = options.subcommandGroup ? `${options.subcommandGroup}.${subcommand}` : subcommand;

	const discordContext: DiscordContext = {
		userId: interaction.user.id,
		username: interaction.user.username,
		guildId: interaction.guildId?.toString(),
		channelId: interaction.channelId?.toString(),
		commandName,
		subcommand: loggedSubcommand,
	};

	logger.info(`Executing hifz progress subcommand: ${loggedSubcommand}`, discordContext, { operationType: 'hifz_progress_command' });

	try {
		switch (subcommand) {
			case hifzProgressSubcommands.UPDATE:
				await handleHifzProgressUpdate(interaction, discordContext);
				return;
			case hifzProgressSubcommands.SHOW:
				await handleHifzProgressShow(interaction, discordContext, options.now);
				return;
			case hifzProgressSubcommands.POST_CURRENT_PAGE:
				await handlePostCurrentHifzPage(interaction, discordContext, options.now);
				return;
			default:
				await interaction.reply({ content: 'Unknown hifz progress command.', flags: MessageFlags.Ephemeral });
		}
	} catch (error) {
		logger.error(`Error executing hifz progress subcommand: ${loggedSubcommand}`, error as Error, discordContext, {
			operationType: 'hifz_progress_command',
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

async function handleHifzProgressUpdate(interaction: any, discordContext: DiscordContext): Promise<void> {
	const currentPage = interaction.options.getInteger(hifzProgressOptions.PAGE);
	if (currentPage === null) {
		logger.info('No hifz progress changes provided', discordContext);
		await interaction.reply({ content: 'No options provided.', flags: MessageFlags.Ephemeral });
		return;
	}

	if (currentPage < 1 || currentPage > 604) {
		logger.warn(`Invalid hifz Quran page number provided: ${currentPage}`, discordContext, {
			operationType: 'hifz_progress_update',
			operationStatus: 'failure',
		});
		await interaction.reply({ content: 'Quran page must be between 1 and 604.', flags: MessageFlags.Ephemeral });
		return;
	}

	logger.info('Updating hifz progress', discordContext, { additionalData: { currentPage } });
	await hifzProgressRepository.updateQuranProgress(currentPage);

	logger.info('Hifz progress updated successfully', discordContext, { operationType: 'hifz_progress_update', operationStatus: 'success' });
	await interaction.reply(`Current memorization page set to \`${currentPage}\`.`);
}

async function handleHifzProgressShow(interaction: any, discordContext: DiscordContext, now?: Date): Promise<void> {
	const [configuration, progress, notes] = await Promise.all([
		configurationRepository.getConfiguration(),
		hifzProgressRepository.getProgress(),
		notesRepository.getNotesByStatus('pending'),
	]);

	logger.info('Displaying current hifz progress dashboard', discordContext, {
		operationType: 'hifz_progress_show',
		operationStatus: 'success',
		additionalData: { progress, pendingNoteCount: notes.length },
	});

	await interaction.reply(
		buildHifzProgressDashboardReply({
			configuration,
			progress,
			pendingNoteCount: notes.length,
			interaction,
			now,
		})
	);
}

async function handlePostCurrentHifzPage(interaction: any, discordContext: DiscordContext, now: Date = new Date()): Promise<void> {
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

	const [configuration, progress] = await Promise.all([configurationRepository.getConfiguration(), hifzProgressRepository.getProgress()]);
	const timezone = normalizeTimeZone(configuration.timezone);
	if (!timezone) {
		await interaction.reply({
			content: 'The hifz timezone is not configured correctly.',
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	const sessionId = getHifzReminderSessionId(now, timezone);
	await channel.send(buildCurrentHifzPagePrompt(sessionId, progress.currentPage));

	logger.info('Posted current hifz page prompt', discordContext, {
		operationType: 'hifz_progress_post_current_page',
		operationStatus: 'success',
		additionalData: { currentPage: progress.currentPage, sessionId, targetChannelId: channelId },
	});

	await interaction.reply({
		content: `Posted current memorization page prompt for page **${progress.currentPage}** in <#${channelId}>.`,
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
