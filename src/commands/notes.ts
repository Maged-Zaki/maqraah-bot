import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { addNote, getNotesByUserId, getAllNotes, deleteNotes } from '../database';

export const data = new SlashCommandBuilder()
	.setName('notes')
	.setDescription('Manage notes')
	.addSubcommand((subcommand) =>
		subcommand
			.setName('add')
			.setDescription('Add a note')
			.addStringOption((option) => option.setName('text').setDescription('The note text').setRequired(true))
	)
	.addSubcommand((subcommand) => subcommand.setName('show-mine').setDescription('Show your personal notes'))
	.addSubcommand((subcommand) => subcommand.setName('show-all').setDescription('Show all notes from all users'))
	.addSubcommand((subcommand) => subcommand.setName('remove-mine').setDescription('Remove all your notes'))
	.addSubcommand((subcommand) => subcommand.setName('remove-all').setDescription('Remove all notes for everyone'));

export async function execute(interaction: any) {
	const subcommand = interaction.options.getSubcommand();

	switch (subcommand) {
		case 'add': {
			const text = interaction.options.getString('text');
			await addNote(interaction.user.id, text);
			await interaction.reply({ content: 'Note added! It will be reminded tomorrow.', flags: MessageFlags.Ephemeral });
			break;
		}
		case 'show-mine': {
			const notes = await getNotesByUserId(interaction.user.id);
			if (notes.length === 0) {
				await interaction.reply({ content: 'You have no notes.', flags: MessageFlags.Ephemeral });
				return;
			}
			const embed = new EmbedBuilder()
				.setTitle('Your Notes')
				.setDescription(notes.map((n) => `${n.note} (Added: ${new Date(n.dateAdded).toLocaleDateString()})`).join('\n'))
				.setColor(0x0099ff);
			await interaction.reply({ embeds: [embed], ephemeral: true });
			break;
		}
		case 'show-all': {
			const notes = await getAllNotes();
			if (notes.length === 0) {
				await interaction.reply({ content: 'There are no notes.', flags: MessageFlags.Ephemeral });
				return;
			}
			const embed = new EmbedBuilder()
				.setTitle('All Notes')
				.setDescription(notes.map((n) => `<@${n.userId}>: ${n.note} (Added: ${new Date(n.dateAdded).toLocaleDateString()})`).join('\n'))
				.setColor(0x0099ff);
			await interaction.reply({ embeds: [embed], ephemeral: true });
			break;
		}
		case 'remove-mine': {
			const notes = await getNotesByUserId(interaction.user.id);
			if (notes.length === 0) {
				await interaction.reply({ content: 'You have no notes to remove.', flags: MessageFlags.Ephemeral });
				return;
			}
			const noteIds = notes.map((n) => n.id);
			await deleteNotes(noteIds);
			await interaction.reply({ content: `Removed ${notes.length} note(s).`, flags: MessageFlags.Ephemeral });
			break;
		}
		case 'remove-all': {
			const notes = await getAllNotes();
			if (notes.length === 0) {
				await interaction.reply({ content: 'There are no notes to remove.', flags: MessageFlags.Ephemeral });
				return;
			}
			const noteIds = notes.map((n) => n.id);
			await deleteNotes(noteIds);
			await interaction.reply({ content: `Removed \`${notes.length}\` notes for all users.` });
			break;
		}
	}
}
