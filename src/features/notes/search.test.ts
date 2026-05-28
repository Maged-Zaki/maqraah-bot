import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNoSearchResultsMessage, formatNoteAuthor, formatSearchResultLine, isNoteAnonymous, isNoteSearchStatus, parseSearchDateRange } from './search';

test('no results returns a friendly message', () => {
	assert.equal(buildNoSearchResultsMessage('missing note'), 'No notes found for "missing note". Try a different search or loosen the filters.');
});

test('no results with empty query omits the query in the message', () => {
	assert.equal(buildNoSearchResultsMessage('  '), 'No notes found. Try a different search or loosen the filters.');
});

test('anonymous search results hide the note author', () => {
	const line = formatSearchResultLine({
		id: 5,
		userId: 'user-1',
		note: 'Bring the printed agenda',
		dateAdded: '2026-04-15T12:00:00.000Z',
		status: 'pending',
		isAnonymous: 1,
	});

	assert.equal(line, '**#5** 2026-04-15 [pending] Anonymous: Bring the printed agenda');
});

test('isNoteSearchStatus accepts valid statuses', () => {
	assert.equal(isNoteSearchStatus('pending'), true);
	assert.equal(isNoteSearchStatus('included'), true);
});

test('isNoteSearchStatus rejects invalid statuses', () => {
	assert.equal(isNoteSearchStatus('deleted'), false);
	assert.equal(isNoteSearchStatus(null), false);
	assert.equal(isNoteSearchStatus(undefined), false);
	assert.equal(isNoteSearchStatus(''), false);
});

test('isNoteAnonymous returns true for boolean true and integer 1', () => {
	assert.equal(isNoteAnonymous({ isAnonymous: true }), true);
	assert.equal(isNoteAnonymous({ isAnonymous: 1 }), true);
});

test('isNoteAnonymous returns false for 0 false and undefined', () => {
	assert.equal(isNoteAnonymous({ isAnonymous: false }), false);
	assert.equal(isNoteAnonymous({ isAnonymous: 0 }), false);
	assert.equal(isNoteAnonymous({ isAnonymous: undefined }), false);
});

test('formatNoteAuthor returns Anonymous for anonymous notes', () => {
	assert.equal(formatNoteAuthor({ id: 1, userId: 'user-1', note: '', dateAdded: '', isAnonymous: true }), 'Anonymous');
	assert.equal(formatNoteAuthor({ id: 2, userId: 'user-1', note: '', dateAdded: '', isAnonymous: 1 }), 'Anonymous');
});

test('formatNoteAuthor returns user mention for non-anonymous notes', () => {
	assert.equal(formatNoteAuthor({ id: 3, userId: 'user-1', note: '', dateAdded: '', isAnonymous: 0 }), '<@user-1>');
	assert.equal(formatNoteAuthor({ id: 4, userId: 'user-1', note: '', dateAdded: '', isAnonymous: false }), '<@user-1>');
});

test('parseSearchDateRange accepts a valid date range', () => {
	const result = parseSearchDateRange('2026-04-01', '2026-04-30');
	assert.equal(result.error, undefined);
	assert.equal(result.startDate, '2026-04-01');
	assert.equal(result.endDate, '2026-04-30');
});

test('parseSearchDateRange accepts start date only', () => {
	const result = parseSearchDateRange('2026-04-01', null);
	assert.equal(result.error, undefined);
	assert.equal(result.startDate, '2026-04-01');
	assert.equal(result.endDate, undefined);
});

test('parseSearchDateRange accepts end date only', () => {
	const result = parseSearchDateRange(null, '2026-04-30');
	assert.equal(result.error, undefined);
	assert.equal(result.startDate, undefined);
	assert.equal(result.endDate, '2026-04-30');
});

test('parseSearchDateRange accepts neither date', () => {
	const result = parseSearchDateRange(null, null);
	assert.equal(result.error, undefined);
	assert.equal(result.startDate, undefined);
	assert.equal(result.endDate, undefined);
});

test('parseSearchDateRange rejects start date after end date', () => {
	const result = parseSearchDateRange('2026-04-30', '2026-04-01');
	assert.equal(result.error, 'Start date must be on or before end date.');
});

test('parseSearchDateRange rejects invalid start date format', () => {
	const result = parseSearchDateRange('not-a-date', null);
	assert.equal(result.error, 'Start date must use YYYY-MM-DD.');
});

test('parseSearchDateRange rejects invalid end date format', () => {
	const result = parseSearchDateRange(null, '2026/04/30');
	assert.equal(result.error, 'End date must use YYYY-MM-DD.');
});

test('formatSearchResultLine uses lastIncludedDate when available', () => {
	const line = formatSearchResultLine({
		id: 3,
		userId: 'user-2',
		note: 'Follow up',
		dateAdded: '2026-04-10T12:00:00.000Z',
		status: 'included',
		lastIncludedDate: '2026-04-15T19:00:00.000Z',
		isAnonymous: 0,
	});
	assert.ok(line.includes('2026-04-15'));
	assert.ok(line.includes('[included]'));
	assert.ok(line.includes('<@user-2>'));
});
