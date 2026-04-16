import type { Note, NoteStatus } from '../../storage/sqlite/repositories/NotesRepository';

export const noteSearchStatuses: readonly NoteStatus[] = ['pending', 'included'];
export type NoteSearchStatus = NoteStatus;

export function isNoteSearchStatus(status: string | null | undefined): status is NoteSearchStatus {
	return noteSearchStatuses.includes(status as NoteSearchStatus);
}

export function buildNoSearchResultsMessage(query: string): string {
	const trimmedQuery = query.trim();
	if (!trimmedQuery) {
		return 'No notes found. Try a different search or loosen the filters.';
	}

	return `No notes found for "${trimmedQuery}". Try a different search or loosen the filters.`;
}

export function formatSearchResultLine(note: Note): string {
	const status = note.status ?? 'pending';
	const displayDate = formatNoteDate(note.lastIncludedDate ?? note.dateAdded);
	return `**#${note.id}** ${displayDate} [${status}] <@${note.userId}>: ${note.note}`;
}

export function parseSearchDateRange(
	startDateInput: string | null | undefined,
	endDateInput: string | null | undefined
): { startDate?: string; endDate?: string; error?: string } {
	const startDate = normalizeIsoDate(startDateInput);
	if (startDate === null) {
		return { error: 'Start date must use YYYY-MM-DD.' };
	}

	const endDate = normalizeIsoDate(endDateInput);
	if (endDate === null) {
		return { error: 'End date must use YYYY-MM-DD.' };
	}

	if (startDate && endDate && startDate > endDate) {
		return { error: 'Start date must be on or before end date.' };
	}

	return { startDate, endDate };
}

function normalizeIsoDate(value: string | null | undefined): string | undefined | null {
	const trimmedValue = value?.trim();
	if (!trimmedValue) {
		return undefined;
	}

	if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) {
		return null;
	}

	const date = new Date(`${trimmedValue}T00:00:00.000Z`);
	if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== trimmedValue) {
		return null;
	}

	return trimmedValue;
}

function formatNoteDate(dateValue: string): string {
	const date = new Date(dateValue);
	if (Number.isNaN(date.getTime())) {
		return dateValue.slice(0, 10);
	}

	return date.toISOString().slice(0, 10);
}
