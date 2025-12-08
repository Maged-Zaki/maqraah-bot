import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getConfig } from '../database';

export const data = new SlashCommandBuilder().setName('show-configuration').setDescription('Display current bot configuration settings');

export async function execute(interaction: any) {
	const config = await getConfig();
	const embed = new EmbedBuilder()
		.setTitle('Configuration')
		.addFields(
			{ name: 'Reminder Time', value: config.dailyTime, inline: true },
			{ name: 'Timezone', value: config.timezone, inline: true },
			{ name: 'Role', value: config.roleId ? `<@&${config.roleId}>` : 'Not set', inline: true },
			{ name: 'Voice Channel', value: config.voiceChannelId ? `<#${config.voiceChannelId}>` : 'Not set', inline: true }
		)
		.setColor(0x0099ff);

	await interaction.reply({ embeds: [embed] });
}
