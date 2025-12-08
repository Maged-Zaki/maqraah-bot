import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder().setName('help').setDescription('List all available commands');

export async function execute(interaction: any) {
	const commands = interaction.client.commands.map((cmd: any) => `\`${cmd.data.name}\`: ${cmd.data.description}`).join('\n');
	await interaction.reply(`Available commands:\n\ ${commands}`);
}
