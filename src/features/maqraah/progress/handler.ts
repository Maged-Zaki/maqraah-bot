import { MessageFlags } from 'discord.js';
import { configurationRepository, notesRepository, progressRepository } from '../../../storage/sqlite';
import { logger, DiscordContext } from '../../../observability/logging/logger';
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

	const lastPage = interaction.options.getInteger(progressOptions.LAST_QURAN_PAGE_READ);
	if (lastPage !== null) {
		if (lastPage < 1 || lastPage > 604) {
			logger.warn(`Invalid Quran page number provided: ${lastPage}`, discordContext, {
				operationType: 'progress_update',
				operationStatus: 'failure',
			});
			await interaction.reply({ content: 'Quran page must be between 1 and 604.', flags: MessageFlags.Ephemeral });
			return;
		}

		updates.lastPage = lastPage;
		replyMessages.push(`Last Qur'an page set to \`${lastPage}\`.`);
	}

	const lastHadith = interaction.options.getInteger(progressOptions.LAST_HADITH);
	if (lastHadith !== null) {
		if (lastHadith <= 0) {
			logger.warn(`Invalid Hadith number provided: ${lastHadith}`, discordContext, {
				operationType: 'progress_update',
				operationStatus: 'failure',
			});
			await interaction.reply({ content: 'Hadith number must be a positive integer.', flags: MessageFlags.Ephemeral });
			return;
		}

		updates.lastHadith = lastHadith;
		replyMessages.push(`Last Hadith set to \`${lastHadith}\`.`);
	}

	if (Object.keys(updates).length === 0) {
		logger.info('No progress changes provided', discordContext);
		await interaction.reply({ content: 'No options provided.', flags: MessageFlags.Ephemeral });
		return;
	}

	logger.info('Updating progress with changes', discordContext, { additionalData: { updates } });
	await progressRepository.updateProgress(updates);
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
