import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { notesRepository } from '../database';
import { logger, DiscordContext } from '../logger';
import { chunkContent } from '../utils';

const subcommands = {
	CREATE: 'create',
	SHOW_MINE: 'show-mine',
	SHOW_ALL: 'show-all',
	DELETE: 'delete',
	DELETE_MINE: 'delete-mine',
	DELETE_ALL: 'delete-all',
	CARRY_OVER_LAST_NOTES: 'carry-over-last-notes',
	SHOW_HISTORY: 'show-history',
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
	.addSubcommand((subcommand) =>
		subcommand
			.setName(subcommands.DELETE)
			.setDescription('Delete specific notes by their position number')
			.addStringOption((option) =>
				option.setName('numbers').setDescription('Note numbers to delete, comma-separated (e.g., "1,2,3")').setRequired(true)
			)
	)
	.addSubcommand((subcommand) => subcommand.setName(subcommands.DELETE_MINE).setDescription('Remove all your notes'))
	.addSubcommand((subcommand) => subcommand.setName(subcommands.DELETE_ALL).setDescription('Remove all notes for everyone'))
	.addSubcommand((subcommand) => subcommand.setName(subcommands.CARRY_OVER_LAST_NOTES).setDescription('Add last maqraah notes to upcoming maqraah'))
	.addSubcommand((subcommand) =>
		subcommand
			.setName(subcommands.SHOW_HISTORY)
			.setDescription('Show notes from a specific date')
			.addIntegerOption((option) => option.setName('day').setDescription('Day (1-31)').setRequired(true).setMinValue(1).setMaxValue(31))
			.addIntegerOption((option) => option.setName('month').setDescription('Month (1-12)').setRequired(true).setMinValue(1).setMaxValue(12))
			.addIntegerOption((option) => option.setName('year').setDescription('Year (e.g., 2024)').setRequired(true).setMinValue(2000).setMaxValue(2100))
	);

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
				const notes = await notesRepository.getNotesByUserId(interaction.user.id);
				const pendingNotes = notes.filter((n) => n.status === 'pending' || n.status === undefined);

				if (pendingNotes.length === 0) {
					logger.info(`User ${interaction.user.id} has no pending notes`, discordContext, { operationType: 'note_view', operationStatus: 'success' });
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

				logger.info(`User ${interaction.user.id} has ${pendingNotes.length} pending notes`, discordContext, {
					operationType: 'note_view',
					operationStatus: 'success',
				});
				logger.recordNoteEvent({
					userId: interaction.user.id,
					username: interaction.user.username,
					guildId: interaction.guildId?.toString(),
					channelId: interaction.channelId?.toString(),
					noteCount: pendingNotes.length,
					operation: 'viewed',
				});

				const notesContent = pendingNotes.map((n) => `${n.note}`).join('\n');
				const chunks = chunkContent(notesContent, 4000); // 4000 for embed safety margin

				for (let i = 0; i < chunks.length; i++) {
					const embed = new EmbedBuilder()
						.setTitle(i === 0 ? 'Your Notes' : `Your Notes (${i + 1}/${chunks.length})`)
						.setDescription(chunks[i])
						.setColor(0x0099ff);

					if (i === 0) {
						await interaction.reply({ embeds: [embed], ephemeral: true });
					} else {
						await interaction.followUp({ embeds: [embed], ephemeral: true });
					}
				}
				break;
			}
			case subcommands.SHOW_ALL: {
				const notes = await notesRepository.getNotesByStatus('pending');

				if (notes.length === 0) {
					logger.info(`No notes found in database`, discordContext, { operationType: 'note_view_all', operationStatus: 'success' });
					await interaction.reply({ content: 'There are no notes.', flags: MessageFlags.Ephemeral });
					return;
				}

				logger.info(`Found ${notes.length} notes in database`, discordContext, { operationType: 'note_view_all', operationStatus: 'success' });

				const notesContent = notes.map((n) => `<@${n.userId}>: ${n.note}`).join('\n');
				const chunks = chunkContent(notesContent, 4000);

				for (let i = 0; i < chunks.length; i++) {
					const embed = new EmbedBuilder()
						.setTitle(i === 0 ? 'All Notes' : `All Notes (${i + 1}/${chunks.length})`)
						.setDescription(chunks[i])
						.setColor(0x0099ff);

					if (i === 0) {
						await interaction.reply({ embeds: [embed], ephemeral: true });
					} else {
						await interaction.followUp({ embeds: [embed], ephemeral: true });
					}
				}
				break;
			}
			case subcommands.DELETE: {
				const numbersInput = interaction.options.getString('numbers');

				// Parse the input into an array of numbers
				const positionStrings = numbersInput.split(',').map((s: string) => s.trim());
				const positions: number[] = [];

				for (const posStr of positionStrings) {
					const num = parseInt(posStr, 10);
					if (isNaN(num) || num < 1) {
						logger.info(`Invalid position provided: ${posStr}`, discordContext, {
							operationType: 'note_delete',
							operationStatus: 'failure',
						});
						await interaction.reply({
							content: `Invalid note number: "${posStr}". Please provide positive numbers only (e.g., 1,2,3).`,
							flags: MessageFlags.Ephemeral,
						});
						return;
					}
					positions.push(num);
				}

				// Remove duplicates and sort
				const uniquePositions = [...new Set(positions)].sort((a, b) => a - b);

				// Fetch all pending notes
				const allNotes = await notesRepository.getNotesByStatus('pending');

				if (allNotes.length === 0) {
					logger.info(`No pending notes to delete`, discordContext, { operationType: 'note_delete', operationStatus: 'success' });
					await interaction.reply({ content: 'There are no notes to delete.', flags: MessageFlags.Ephemeral });
					return;
				}

				// Sort notes by dateAdded (oldest first)
				allNotes.sort((a, b) => new Date(a.dateAdded).getTime() - new Date(b.dateAdded).getTime());

				// Validate positions are within range
				const maxPosition = allNotes.length;
				const invalidPositions = uniquePositions.filter((p) => p > maxPosition);

				if (invalidPositions.length > 0) {
					logger.info(`Positions out of range: ${invalidPositions.join(', ')}`, discordContext, {
						operationType: 'note_delete',
						operationStatus: 'failure',
					});
					await interaction.reply({
						content: `Invalid position(s): ${invalidPositions.join(', ')}. There are only ${maxPosition} note(s).`,
						flags: MessageFlags.Ephemeral,
					});
					return;
				}

				// Map positions to notes (position 1 = index 0) and collect info for display
				const notesToDelete = uniquePositions.map((pos) => ({
					position: pos,
					id: allNotes[pos - 1].id,
					note: allNotes[pos - 1].note,
					userId: allNotes[pos - 1].userId,
				}));
				const noteIdsToDelete = notesToDelete.map((n) => n.id);

				// Delete the notes
				await notesRepository.deleteNotes(noteIdsToDelete);

				logger.info(`Deleted ${noteIdsToDelete.length} notes at positions: ${uniquePositions.join(', ')}`, discordContext, {
					operationType: 'note_delete',
					operationStatus: 'success',
				});
				logger.recordNoteEvent({
					userId: interaction.user.id,
					username: interaction.user.username,
					guildId: interaction.guildId?.toString(),
					channelId: interaction.channelId?.toString(),
					noteCount: noteIdsToDelete.length,
					noteIds: noteIdsToDelete,
					operation: 'deleted',
				});

				// Format deleted notes for display
				const deletedNotesList = notesToDelete.map((n) => `**#${n.position}**: ${n.note}`).join('\n');
				const replyContent = `Deleted ${noteIdsToDelete.length} note(s):\n\n${deletedNotesList}`;

				await interaction.reply({
					content: replyContent,
					flags: MessageFlags.Ephemeral,
				});
				break;
			}
			case subcommands.DELETE_MINE: {
				const notes = await notesRepository.getNotesByUserId(interaction.user.id);
				const pendingNotes = notes.filter((n) => n.status === 'pending' || n.status === undefined);

				if (pendingNotes.length === 0) {
					logger.info(`User ${interaction.user.id} has no pending notes to delete`, discordContext, {
						operationType: 'note_delete',
						operationStatus: 'success',
					});
					await interaction.reply({ content: 'You have no notes to remove.', flags: MessageFlags.Ephemeral });
					return;
				}

				const noteIds = pendingNotes.map((n) => n.id);
				await notesRepository.deleteNotes(noteIds);

				logger.info(`Deleted ${pendingNotes.length} notes for user ${interaction.user.id}`, discordContext, {
					operationType: 'note_delete',
					operationStatus: 'success',
				});
				logger.recordNoteEvent({
					userId: interaction.user.id,
					username: interaction.user.username,
					guildId: interaction.guildId?.toString(),
					channelId: interaction.channelId?.toString(),
					noteCount: pendingNotes.length,
					noteIds,
					operation: 'deleted',
				});

				await interaction.reply({ content: `Removed ${pendingNotes.length} note(s).`, flags: MessageFlags.Ephemeral });
				break;
			}
			case subcommands.DELETE_ALL: {
				const notes = await notesRepository.getAllNotes();

				if (notes.length === 0) {
					logger.info(`No notes to delete`, discordContext, { operationType: 'note_delete_all', operationStatus: 'success' });
					await interaction.reply({ content: 'There are no notes to remove.', flags: MessageFlags.Ephemeral });
					return;
				}

				await notesRepository.deleteAllNotes();

				logger.info(`Deleted all ${notes.length} notes`, discordContext, { operationType: 'note_delete_all', operationStatus: 'success' });

				await interaction.reply({ content: `Removed \`${notes.length}\` notes for all users.` });
				break;
			}
			case subcommands.CARRY_OVER_LAST_NOTES: {
				const includedNotes = await notesRepository.getIncludedNotes();

				if (includedNotes.length === 0) {
					logger.info(`No included notes to carry over`, discordContext, { operationType: 'note_carry_over', operationStatus: 'success' });
					await interaction.reply({ content: 'There are no notes from the previous maqraah to carry over.', flags: MessageFlags.Ephemeral });
					return;
				}

				const noteIds = includedNotes.map((n) => n.id);
				await notesRepository.carryOverNotes(noteIds);

				logger.info(`Carried over ${includedNotes.length} notes to pending status`, discordContext, {
					operationType: 'note_carry_over',
					operationStatus: 'success',
				});

				await interaction.reply({ content: `Carried over \`${includedNotes.length}\` note(s) from the previous maqraah to the upcoming one.` });
				break;
			}
			case subcommands.SHOW_HISTORY: {
				const day = interaction.options.getInteger('day');
				const month = interaction.options.getInteger('month');
				const year = interaction.options.getInteger('year');

				// Validate the date
				const date = new Date(year, month - 1, day);
				if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
					logger.info(`Invalid date provided: ${day}/${month}/${year}`, discordContext, {
						operationType: 'note_history',
						operationStatus: 'failure',
					});
					await interaction.reply({ content: 'Invalid date. Please provide a valid date.', flags: MessageFlags.Ephemeral });
					return;
				}

				// Format date as YYYY-MM-DD for database query
				const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
				const notes = await notesRepository.getNotesByDate(dateString);

				if (notes.length === 0) {
					logger.info(`No notes found for date: ${dateString}`, discordContext, { operationType: 'note_history', operationStatus: 'success' });
					await interaction.reply({ content: `No notes found for ${dateString}.`, flags: MessageFlags.Ephemeral });
					return;
				}

				logger.info(`Found ${notes.length} notes for date: ${dateString}`, discordContext, {
					operationType: 'note_history',
					operationStatus: 'success',
				});

				// Format the date for display
				const formattedDate = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
				const notesContent = notes.map((n) => `<@${n.userId}>: ${n.note}`).join('\n');
				const chunks = chunkContent(notesContent, 4000);

				for (let i = 0; i < chunks.length; i++) {
					const embed = new EmbedBuilder()
						.setTitle(i === 0 ? `Notes from ${formattedDate}` : `Notes from ${formattedDate} (${i + 1}/${chunks.length})`)
						.setDescription(chunks[i])
						.setColor(0x0099ff);

					if (i === 0) {
						await interaction.reply({ embeds: [embed], ephemeral: true });
					} else {
						await interaction.followUp({ embeds: [embed], ephemeral: true });
					}
				}
				break;
			}
		}
	} catch (error) {
		logger.error(`Error executing notes subcommand: ${subcommand}`, error as Error, discordContext, {
			operationType: 'notes_command',
			operationStatus: 'failure',
			additionalData: {
				subcommand,
				userId: interaction.user.id,
				guildId: interaction.guildId?.toString(),
				channelId: interaction.channelId?.toString(),
			},
		});
		await interaction.reply({ content: 'There was an error executing this command!', flags: MessageFlags.Ephemeral });
	}
}
