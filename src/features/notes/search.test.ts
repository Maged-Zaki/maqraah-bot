import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNoSearchResultsMessage } from './search';

test('no results returns a friendly message', () => {
	assert.equal(buildNoSearchResultsMessage('missing note'), 'No notes found for "missing note". Try a different search or loosen the filters.');
});
