import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { updateConfig } from '../database';

export const data = new SlashCommandBuilder()
	.setName('set-progress')
	.setDescription('Set daily reading progress')
	.addIntegerOption((option) => option.setName('lastpage').setDescription("Last Qur'an page read"))
	.addIntegerOption((option) => option.setName('lasthadith').setDescription('Last Hadith read'));

export async function execute(interaction: any) {
	const updates: any = {};
	let replyMessages: string[] = [];

	const lastpage = interaction.options.getInteger('lastpage');
	if (lastpage !== null) {
		if (lastpage < 1 || lastpage > 604) {
			await interaction.reply({ content: 'Quran page must be between 1 and 604.', flags: MessageFlags.Ephemeral });
			return;
		}
		updates.lastPage = lastpage;
		replyMessages.push(`Last Qur'an page set to \`${lastpage}\`.`);
	}

	const lasthadith = interaction.options.getInteger('lasthadith');
	if (lasthadith !== null) {
		if (lasthadith <= 0) {
			await interaction.reply({ content: 'Hadith number must be a positive integer.', flags: MessageFlags.Ephemeral });
			return;
		}
		updates.lastHadith = lasthadith;
		replyMessages.push(`Last Hadith set to \`${lasthadith}\`.`);
	}

	if (Object.keys(updates).length > 0) {
		await updateConfig(updates);
		await interaction.reply(replyMessages.join('\n'));
	} else {
		await interaction.reply({ content: 'No options provided.', flags: MessageFlags.Ephemeral });
	}
}

