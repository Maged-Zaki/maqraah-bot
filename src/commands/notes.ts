import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { notesRepository } from '../database';
import { logger, DiscordContext } from '../logger';

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

	const discordContext: DiscordContext = {
		userId: interaction.user.id,
		username: interaction.user.username,
		guildId: interaction.guildId?.toString(),
		channelId: interaction.channelId?.toString(),
		commandName: 'notes',
		subcommand,
	};

	logger.info(`Executing notes subcommand: ${subcommand}`, discordContext, { operationType: 'notes_command' });

	try {
		switch (subcommand) {
			case subcommands.CREATE: {
				const text = interaction.options.getString('text');
				logger.debug(`Creating note for user ${interaction.user.id}`, discordContext, { additionalData: { noteLength: text?.length } });

				await notesRepository.addNote(interaction.user.id, text);

				logger.info(`Note created successfully for user ${interaction.user.id}`, discordContext, {
					operationType: 'note_create',
					operationStatus: 'success',
				});
				logger.recordNoteEvent({
					userId: interaction.user.id,
					username: interaction.user.username,
					guildId: interaction.guildId?.toString(),
					channelId: interaction.channelId?.toString(),
					noteContent: text,
					operation: 'created',
				});

				await interaction.reply({ content: 'Note added! It will be reminded upcoming maqraah.', flags: MessageFlags.Ephemeral });
				break;
			}
			case subcommands.SHOW_MINE: {
				logger.debug(`Fetching notes for user ${interaction.user.id}`, discordContext);

				const notes = await notesRepository.getNotesByUserId(interaction.user.id);

				if (notes.length === 0) {
					logger.info(`User ${interaction.user.id} has no notes`, discordContext, { operationType: 'note_view', operationStatus: 'success' });
					logger.recordNoteEvent({
						userId: interaction.user.id,
						username: interaction.user.username,
						guildId: interaction.guildId?.toString(),
						channelId: interaction.channelId?.toString(),
						noteCount: 0,
						operation: 'viewed',
					});
					await interaction.reply({ content: 'You have no notes.', flags: MessageFlags.Ephemeral });
					return;
				}

				logger.info(`User ${interaction.user.id} has ${notes.length} notes`, discordContext, {
					operationType: 'note_view',
					operationStatus: 'success',
				});
				logger.recordNoteEvent({
					userId: interaction.user.id,
					username: interaction.user.username,
					guildId: interaction.guildId?.toString(),
					channelId: interaction.channelId?.toString(),
					noteCount: notes.length,
					operation: 'viewed',
				});

				const embed = new EmbedBuilder()
					.setTitle('Your Notes')
					.setDescription(notes.map((n) => `${n.note}`).join('\n'))
					.setColor(0x0099ff);
				await interaction.reply({ embeds: [embed], ephemeral: true });
				break;
			}
			case subcommands.SHOW_ALL: {
				logger.debug(`Fetching all notes`, discordContext);

				const notes = await notesRepository.getAllNotes();

				if (notes.length === 0) {
					logger.info(`No notes found in database`, discordContext, { operationType: 'note_view_all', operationStatus: 'success' });
					await interaction.reply({ content: 'There are no notes.', flags: MessageFlags.Ephemeral });
					return;
				}

				logger.info(`Found ${notes.length} notes in database`, discordContext, { operationType: 'note_view_all', operationStatus: 'success' });

				const embed = new EmbedBuilder()
					.setTitle('All Notes')
					.setDescription(notes.map((n) => `<@${n.userId}>: ${n.note}`).join('\n'))
					.setColor(0x0099ff);
				await interaction.reply({ embeds: [embed], ephemeral: true });
				break;
			}
			case subcommands.DELETE_MINE: {
				logger.debug(`Fetching notes for deletion for user ${interaction.user.id}`, discordContext);

				const notes = await notesRepository.getNotesByUserId(interaction.user.id);

				if (notes.length === 0) {
					logger.info(`User ${interaction.user.id} has no notes to delete`, discordContext, {
						operationType: 'note_delete',
						operationStatus: 'success',
					});
					await interaction.reply({ content: 'You have no notes to remove.', flags: MessageFlags.Ephemeral });
					return;
				}

				const noteIds = notes.map((n) => n.id);
				logger.debug(`Deleting ${notes.length} notes for user ${interaction.user.id}`, discordContext, { additionalData: { noteIds } });

				await notesRepository.deleteNotes(noteIds);

				logger.info(`Deleted ${notes.length} notes for user ${interaction.user.id}`, discordContext, {
					operationType: 'note_delete',
					operationStatus: 'success',
				});
				logger.recordNoteEvent({
					userId: interaction.user.id,
					username: interaction.user.username,
					guildId: interaction.guildId?.toString(),
					channelId: interaction.channelId?.toString(),
					noteCount: notes.length,
					noteIds,
					operation: 'deleted',
				});

				await interaction.reply({ content: `Removed ${notes.length} note(s).`, flags: MessageFlags.Ephemeral });
				break;
			}
			case subcommands.DELETE_ALL: {
				logger.debug(`Fetching all notes for deletion`, discordContext);

				const notes = await notesRepository.getAllNotes();

				if (notes.length === 0) {
					logger.info(`No notes to delete`, discordContext, { operationType: 'note_delete_all', operationStatus: 'success' });
					await interaction.reply({ content: 'There are no notes to remove.', flags: MessageFlags.Ephemeral });
					return;
				}

				logger.debug(`Deleting all ${notes.length} notes`, discordContext);

				await notesRepository.deleteAllNotes();

				logger.info(`Deleted all ${notes.length} notes`, discordContext, { operationType: 'note_delete_all', operationStatus: 'success' });

				await interaction.reply({ content: `Removed \`${notes.length}\` notes for all users.` });
				break;
			}
		}
	} catch (error) {
		logger.error(`Error executing notes subcommand: ${subcommand}`, error as Error, discordContext, {
			operationType: 'notes_command',
			operationStatus: 'failure',
		});
		await interaction.reply({ content: 'There was an error executing this command!', flags: MessageFlags.Ephemeral });
	}
}
