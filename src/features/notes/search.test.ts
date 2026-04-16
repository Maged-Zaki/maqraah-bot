import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNoSearchResultsMessage, formatSearchResultLine } from './search';

test('no results returns a friendly message', () => {
	assert.equal(buildNoSearchResultsMessage('missing note'), 'No notes found for "missing note". Try a different search or loosen the filters.');
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
