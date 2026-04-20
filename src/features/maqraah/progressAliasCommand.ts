import { SlashCommandBuilder } from 'discord.js';
import { addProgressSubcommands } from './progress/builders';
import { handleProgressCommand } from './progress/handler';

export const data = addProgressSubcommands(new SlashCommandBuilder().setName('progress').setDescription('Manage reading progress'));

export async function execute(interaction: any) {
	await handleProgressCommand(interaction, { commandName: 'progress' });
}
