import { MessageFlags } from 'discord.js';
import type { Note } from '../../storage/sqlite/repositories/NotesRepository';
import { logger, DiscordContext } from '../../observability/logging/logger';
import {
	CreateDestructiveConfirmationOptions,
	DESTRUCTIVE_CONFIRMATION_TIMEOUT_MS,
	destructiveConfirmationStore,
} from '../../shared/confirmations/destructiveConfirmation';
import { buildDestructiveConfirmationActionRows } from '../../shared/confirmations/components';
import { formatNoteAuthor } from './search';

const PREVIEW_NOTE_LIMIT = 5;
const PREVIEW_NOTE_TEXT_LIMIT = 120;

export interface NotesDeletionRepository {
	deleteNotes(ids: number[]): Promise<void>;
}

export interface NotesDeletionConfirmationOptions {
	interaction: any;
	notes: Note[];
	repository: NotesDeletionRepository;
	discordContext: DiscordContext;
	scope: 'selected' | 'mine' | 'all';
	positionsById?: Map<number, number>;
}

export async function requestNotesDeletionConfirmation(options: NotesDeletionConfirmationOptions): Promise<void> {
	const noteIds = options.notes.map((note) => note.id);
	const confirmation = destructiveConfirmationStore.create({
		userId: options.interaction.user.id,
		onConfirm: async () => {
			await options.repository.deleteNotes(noteIds);
			logConfirmedDeletion(options, noteIds);
			return buildConfirmedDeletionMessage(options.scope, noteIds.length);
		},
		expiredContent: 'This delete confirmation expired. No notes were removed.',
		cancelledContent: 'Cancelled. No notes were removed.',
	} satisfies CreateDestructiveConfirmationOptions);

	await options.interaction.reply({
		content: buildDeletionConfirmationMessage(options.scope, options.notes, options.positionsById),
		components: buildDestructiveConfirmationActionRows(confirmation.id),
		flags: MessageFlags.Ephemeral,
	});
}

export function buildDeletionConfirmationMessage(scope: NotesDeletionConfirmationOptions['scope'], notes: Note[], positionsById?: Map<number, number>): string {
	const target = getDeletionTargetDescription(scope, notes.length);
	const preview = buildNotesPreview(notes, positionsById);
	const timeoutSeconds = Math.round(DESTRUCTIVE_CONFIRMATION_TIMEOUT_MS / 1000);

	return `Please confirm deletion of ${target}.\n\nPreview:\n${preview}\n\nThis confirmation expires in ${timeoutSeconds} seconds.`;
}

function buildNotesPreview(notes: Note[], positionsById?: Map<number, number>): string {
	const previewLines = notes.slice(0, PREVIEW_NOTE_LIMIT).map((note, index) => {
		const position = positionsById?.get(note.id);
		const label = position ? `#${position}` : `${index + 1}.`;
		return `${label} ${formatNoteAuthor(note)}: ${truncateNoteText(note.note)}`;
	});

	if (notes.length > PREVIEW_NOTE_LIMIT) {
		previewLines.push(`...and ${notes.length - PREVIEW_NOTE_LIMIT} more note(s).`);
	}

	return previewLines.join('\n');
}

function truncateNoteText(noteText: string): string {
	const singleLineText = noteText.replace(/\s+/g, ' ').trim();
	if (singleLineText.length <= PREVIEW_NOTE_TEXT_LIMIT) {
		return singleLineText;
	}

	return `${singleLineText.slice(0, PREVIEW_NOTE_TEXT_LIMIT - 3)}...`;
}

function getDeletionTargetDescription(scope: NotesDeletionConfirmationOptions['scope'], noteCount: number): string {
	switch (scope) {
		case 'all':
			return `all ${noteCount} note(s) for everyone`;
		case 'mine':
			return `your ${noteCount} pending note(s)`;
		case 'selected':
			return `${noteCount} selected note(s)`;
	}
}

function buildConfirmedDeletionMessage(scope: NotesDeletionConfirmationOptions['scope'], noteCount: number): string {
	switch (scope) {
		case 'all':
			return `Removed ${noteCount} note(s) for all users.`;
		case 'mine':
			return `Removed ${noteCount} note(s).`;
		case 'selected':
			return `Deleted ${noteCount} selected note(s).`;
	}
}

function logConfirmedDeletion(options: NotesDeletionConfirmationOptions, noteIds: number[]): void {
	const operationType = options.scope === 'all' ? 'note_delete_all' : 'note_delete';

	logger.info(`Confirmed deletion of ${noteIds.length} note(s)`, options.discordContext, {
		operationType,
		operationStatus: 'success',
	});
	logger.recordNoteEvent({
		userId: options.interaction.user.id,
		username: options.interaction.user.username,
		guildId: options.interaction.guildId?.toString(),
		channelId: options.interaction.channelId?.toString(),
		noteCount: noteIds.length,
		noteIds,
		operation: 'deleted',
	});
}
