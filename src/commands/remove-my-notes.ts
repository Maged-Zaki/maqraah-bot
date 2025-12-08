import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getNotesByUserId, deleteNotes } from '../database';

export const data = new SlashCommandBuilder().setName('remove-my-notes').setDescription('Remove all your notes');

export async function execute(interaction: any) {
	const notes = await getNotesByUserId(interaction.user.id);
	if (notes.length === 0) {
		await interaction.reply({ content: 'You have no notes to remove.', flags: MessageFlags.Ephemeral });
		return;
	}
	const noteIds = notes.map((n) => n.id);
	await deleteNotes(noteIds);
	await interaction.reply({ content: `Removed ${notes.length} note(s).`, flags: MessageFlags.Ephemeral });
}
