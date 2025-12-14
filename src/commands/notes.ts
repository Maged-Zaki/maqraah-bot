import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { notesRepository } from '../database';

const subcommands = {
	CREATE: 'create',
	SHOW_MINE: 'show-mine',
	SHOW_ALL: 'show-all',
	DELETE_MINE: 'delete-mine',
	DELETE_ALL: 'delete-all',
} as const;

export const data = new SlashCommandBuilder()
	.setName('notes')
	.setDescription('Manage notes')
	.addSubcommand((subcommand) =>
		subcommand
			.setName(subcommands.CREATE)
			.setDescription('Creates a new note and saves it for upcoming maqraah reminder')
			.addStringOption((option) => option.setName('text').setDescription('The note text').setRequired(true))
	)
	.addSubcommand((subcommand) => subcommand.setName(subcommands.SHOW_MINE).setDescription('Show your personal notes'))
	.addSubcommand((subcommand) => subcommand.setName(subcommands.SHOW_ALL).setDescription('Show all notes from all users'))
	.addSubcommand((subcommand) => subcommand.setName(subcommands.DELETE_MINE).setDescription('Remove all your notes'))
	.addSubcommand((subcommand) => subcommand.setName(subcommands.DELETE_ALL).setDescription('Remove all notes for everyone'));

export async function execute(interaction: any) {
	const subcommand = interaction.options.getSubcommand();

	switch (subcommand) {
		case subcommands.CREATE: {
			const text = interaction.options.getString('text');
			await notesRepository.addNote(interaction.user.id, text);
			await interaction.reply({ content: 'Note added! It will be reminded upcoming maqraah.', flags: MessageFlags.Ephemeral });
			break;
		}
		case subcommands.SHOW_MINE: {
			const notes = await notesRepository.getNotesByUserId(interaction.user.id);
			if (notes.length === 0) {
				await interaction.reply({ content: 'You have no notes.', flags: MessageFlags.Ephemeral });
				return;
			}
			const embed = new EmbedBuilder()
				.setTitle('Your Notes')
				.setDescription(notes.map((n) => `${n.note}`).join('\n'))
				.setColor(0x0099ff);
			await interaction.reply({ embeds: [embed], ephemeral: true });
			break;
		}
		case subcommands.SHOW_ALL: {
			const notes = await notesRepository.getAllNotes();
			if (notes.length === 0) {
				await interaction.reply({ content: 'There are no notes.', flags: MessageFlags.Ephemeral });
				return;
			}
			const embed = new EmbedBuilder()
				.setTitle('All Notes')
				.setDescription(notes.map((n) => `<@${n.userId}>: ${n.note}`).join('\n'))
				.setColor(0x0099ff);
			await interaction.reply({ embeds: [embed], ephemeral: true });
			break;
		}
		case subcommands.DELETE_MINE: {
			const notes = await notesRepository.getNotesByUserId(interaction.user.id);
			if (notes.length === 0) {
				await interaction.reply({ content: 'You have no notes to remove.', flags: MessageFlags.Ephemeral });
				return;
			}
			const noteIds = notes.map((n) => n.id);
			await notesRepository.deleteNotes(noteIds);
			await interaction.reply({ content: `Removed ${notes.length} note(s).`, flags: MessageFlags.Ephemeral });
			break;
		}
		case subcommands.DELETE_ALL: {
			const notes = await notesRepository.getAllNotes();
			if (notes.length === 0) {
				await interaction.reply({ content: 'There are no notes to remove.', flags: MessageFlags.Ephemeral });
				return;
			}
			await notesRepository.deleteAllNotes();
			await interaction.reply({ content: `Removed \`${notes.length}\` notes for all users.` });
			break;
		}
	}
}
