import assert from 'node:assert/strict';
import test from 'node:test';
import {
	calculatePagesRemaining,
	calculateProgressPercentage,
	estimateKhatmahCompletion,
	getCompletedKhatmahCount,
	getQuranPageUpdateMetrics,
	isQuranProgressWrap,
} from './progress';

test('wrap detection only triggers near the end of one khatmah and start of the next', () => {
	assert.equal(isQuranProgressWrap(600, 2), true);
	assert.equal(isQuranProgressWrap(604, 1), true);
	assert.equal(isQuranProgressWrap(300, 2), false);
	assert.equal(isQuranProgressWrap(600, 120), false);
});

test('quran page update metrics record wrapped khatmah completions', () => {
	const metrics = getQuranPageUpdateMetrics(600, 2, 0);

	assert.deepEqual(metrics, {
		wrapped: true,
		completedKhatmah: true,
		pagesAdvanced: 6,
		shouldRecordHistory: true,
		correctedBackward: false,
		nextCycleCount: 1,
	});
});

test('quran page corrections moving backward outside the wrap window do not affect pace history', () => {
	const metrics = getQuranPageUpdateMetrics(300, 250, 2);

	assert.equal(metrics.wrapped, false);
	assert.equal(metrics.completedKhatmah, false);
	assert.equal(metrics.shouldRecordHistory, false);
	assert.equal(metrics.correctedBackward, true);
	assert.equal(metrics.pagesAdvanced, 0);
	assert.equal(metrics.nextCycleCount, 2);
});

test('progress helpers compute percentage, pages remaining, and completed khatmah counts', () => {
	assert.equal(calculateProgressPercentage(302).toFixed(2), '50.00');
	assert.equal(calculatePagesRemaining(302), 302);
	assert.equal(getCompletedKhatmahCount({ lastPage: 604, khatmahCycleCount: 2 }), 3);
	assert.equal(getCompletedKhatmahCount({ lastPage: 12, khatmahCycleCount: 2 }), 2);
});

test('completion estimate uses recent session pace and handles completed or missing history states', () => {
	const estimate = estimateKhatmahCompletion(
		300,
		[{ pagesAdvanced: 20 }, { pagesAdvanced: 10 }, { pagesAdvanced: 30 }],
		new Date('2026-04-21T00:00:00.000Z')
	);

	if (!estimate || estimate === 'completed') {
		assert.fail('Expected a completion estimate from recent progress history.');
	}

	assert.equal(estimate.remainingSessions, 16);
	assert.equal(estimate.estimatedCompletionDate.toISOString(), '2026-05-07T00:00:00.000Z');
	assert.equal(estimateKhatmahCompletion(604, [], new Date('2026-04-21T00:00:00.000Z')), 'completed');
	assert.equal(estimateKhatmahCompletion(12, [], new Date('2026-04-21T00:00:00.000Z')), null);
});
