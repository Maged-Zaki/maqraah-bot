import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getAllNotes, deleteNotes } from '../database';

export const data = new SlashCommandBuilder().setName('remove-all-notes').setDescription('Remove all notes for everyone');

export async function execute(interaction: any) {
	const notes = await getAllNotes();
	if (notes.length === 0) {
		await interaction.reply({ content: 'There are no notes to remove.', flags: MessageFlags.Ephemeral });
		return;
	}
	const noteIds = notes.map((n) => n.id);
	await deleteNotes(noteIds);
	await interaction.reply({ content: `Removed ${notes.length} note(s) for all users.`, flags: MessageFlags.Ephemeral });
}
