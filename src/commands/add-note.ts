import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { addNote } from '../database';

export const data = new SlashCommandBuilder()
	.setName('add-note')
	.setDescription('Add a note to be reminded tomorrow')
	.addStringOption((option) => option.setName('text').setDescription('The note text').setRequired(true));

export async function execute(interaction: any) {
	const text = interaction.options.getString('text');
	await addNote(interaction.user.id, text);
	await interaction.reply({ content: 'Note added! It will be reminded tomorrow.', flags: MessageFlags.Ephemeral });
}
