import assert from 'node:assert/strict';
import test from 'node:test';
import { calculatePagesRemaining, calculateProgressPercentage, TOTAL_QURAN_PAGES } from './progress';

test('progress helpers compute percentage and pages remaining', () => {
	assert.equal(TOTAL_QURAN_PAGES, 604);
	assert.equal(calculateProgressPercentage(303).toFixed(2), '50.00');
	assert.equal(calculatePagesRemaining(303), 302);
	assert.equal(calculatePagesRemaining(604), 1);
});
