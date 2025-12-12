import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { progressRepository } from '../database';

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

	switch (subcommand) {
		case subcommands.UPDATE: {
			const updates: any = {};
			let replyMessages: string[] = [];

			const lastpage = interaction.options.getInteger(options.LAST_QURAN_PAGE_READ);
			if (lastpage !== null) {
				if (lastpage < 1 || lastpage > 604) {
					await interaction.reply({ content: 'Quran page must be between 1 and 604.', flags: MessageFlags.Ephemeral });
					return;
				}
				updates.lastPage = lastpage;
				replyMessages.push(`Last Qur'an page set to \`${lastpage}\`.`);
			}

			const lasthadith = interaction.options.getInteger(options.LAST_HADITH);
			if (lasthadith !== null) {
				if (lasthadith <= 0) {
					await interaction.reply({ content: 'Hadith number must be a positive integer.', flags: MessageFlags.Ephemeral });
					return;
				}
				updates.lastHadith = lasthadith;
				replyMessages.push(`Last Hadith set to \`${lasthadith}\`.`);
			}

			if (Object.keys(updates).length > 0) {
				await progressRepository.updateProgress(updates);
				await interaction.reply(replyMessages.join('\n'));
			} else {
				await interaction.reply({ content: 'No options provided.', flags: MessageFlags.Ephemeral });
			}
			break;
		}
		case subcommands.SHOW: {
			const progress = await progressRepository.getProgress();
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
}
