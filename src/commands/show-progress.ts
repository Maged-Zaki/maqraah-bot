import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getConfig } from '../database';

export const data = new SlashCommandBuilder().setName('show-progress').setDescription('Display current reading progress');

export async function execute(interaction: any) {
	const config = await getConfig();
	const embed = new EmbedBuilder()
		.setTitle('Reading Progress')
		.addFields(
			{ name: "Last Qur'an Page", value: `${config.lastPage}`, inline: true },
			{ name: 'Last Hadith', value: `${config.lastHadith}`, inline: true }
		)
		.setColor(0x0099ff);

	await interaction.reply({ embeds: [embed], ephemeral: true });
}
