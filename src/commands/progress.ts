import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { progressRepository } from '../database';
import { logger, DiscordContext } from '../logger';

const subcommands = {
	UPDATE: 'update',
	SHOW: 'show',
} as const;

const options = {
	LAST_QURAN_PAGE_READ: 'last-quran-page-read',
	LAST_HADITH: 'last-hadith',
} as const;

export const data = new SlashCommandBuilder()
	.setName('progress')
	.setDescription('Manage reading progress')
	.addSubcommand((subcommand) =>
		subcommand
			.setName(subcommands.UPDATE)
			.setDescription('Update daily reading progress')
			.addIntegerOption((option) => option.setName(options.LAST_QURAN_PAGE_READ).setDescription("Last Qur'an page you've read"))
			.addIntegerOption((option) => option.setName(options.LAST_HADITH).setDescription('Last Hadith read'))
	)
	.addSubcommand((subcommand) => subcommand.setName(subcommands.SHOW).setDescription('Display current reading progress'));

export async function execute(interaction: any) {
	const subcommand = interaction.options.getSubcommand();

	const discordContext: DiscordContext = {
		userId: interaction.user.id,
		username: interaction.user.username,
		guildId: interaction.guildId?.toString(),
		channelId: interaction.channelId?.toString(),
		commandName: 'progress',
		subcommand,
	};

	logger.info(`Executing progress subcommand: ${subcommand}`, discordContext, { operationType: 'progress_command' });

	try {
		switch (subcommand) {
			case subcommands.UPDATE: {
				const updates: any = {};
				let replyMessages: string[] = [];

				const lastpage = interaction.options.getInteger(options.LAST_QURAN_PAGE_READ);
				if (lastpage !== null) {
					if (lastpage < 1 || lastpage > 604) {
						logger.warn(`Invalid Quran page number provided: ${lastpage}`, discordContext, {
							operationType: 'progress_update',
							operationStatus: 'failure',
						});
						await interaction.reply({ content: 'Quran page must be between 1 and 604.', flags: MessageFlags.Ephemeral });
						return;
					}
					updates.lastPage = lastpage;
					replyMessages.push(`Last Qur'an page set to \`${lastpage}\`.`);
					logger.debug(`Updating last Quran page to ${lastpage}`, discordContext);
				}

				const lasthadith = interaction.options.getInteger(options.LAST_HADITH);
				if (lasthadith !== null) {
					if (lasthadith <= 0) {
						logger.warn(`Invalid Hadith number provided: ${lasthadith}`, discordContext, {
							operationType: 'progress_update',
							operationStatus: 'failure',
						});
						await interaction.reply({ content: 'Hadith number must be a positive integer.', flags: MessageFlags.Ephemeral });
						return;
					}
					updates.lastHadith = lasthadith;
					replyMessages.push(`Last Hadith set to \`${lasthadith}\`.`);
					logger.debug(`Updating last Hadith to ${lasthadith}`, discordContext);
				}

				if (Object.keys(updates).length > 0) {
					logger.info(`Updating progress with changes`, discordContext, { additionalData: { updates } });
					await progressRepository.updateProgress(updates);
					logger.info(`Progress updated successfully`, discordContext, { operationType: 'progress_update', operationStatus: 'success' });
					await interaction.reply(replyMessages.join('\n'));
				} else {
					logger.info(`No progress changes provided`, discordContext);
					await interaction.reply({ content: 'No options provided.', flags: MessageFlags.Ephemeral });
				}
				break;
			}
			case subcommands.SHOW: {
				logger.debug(`Fetching current progress`, discordContext);
				const progress = await progressRepository.getProgress();

				logger.info(`Displaying current progress`, discordContext, {
					operationType: 'progress_show',
					operationStatus: 'success',
					additionalData: { progress },
				});

				const embed = new EmbedBuilder()
					.setTitle('Reading Progress')
					.addFields(
						{ name: "Last Qur'an Page", value: `${progress.lastPage}`, inline: true },
						{ name: 'Last Hadith', value: `${progress.lastHadith}`, inline: true }
					)
					.setColor(0x0099ff);

				await interaction.reply({ embeds: [embed], ephemeral: true });
				break;
			}
		}
	} catch (error) {
		logger.error(`Error executing progress subcommand: ${subcommand}`, error as Error, discordContext, {
			operationType: 'progress_command',
			operationStatus: 'failure',
		});
		await interaction.reply({ content: 'There was an error executing this command!', flags: MessageFlags.Ephemeral });
	}
}
