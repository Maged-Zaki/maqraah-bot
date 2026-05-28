import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidIsoDate, parseIsoDateList } from './isoDates';

test('valid ISO dates pass validation', () => {
	assert.equal(isValidIsoDate('2026-01-01'), true);
	assert.equal(isValidIsoDate('2026-04-20'), true);
	assert.equal(isValidIsoDate('2026-12-31'), true);
});

test('February 29 is valid on leap years', () => {
	assert.equal(isValidIsoDate('2024-02-29'), true);
	assert.equal(isValidIsoDate('2026-02-29'), false);
});

test('February 30 is never valid', () => {
	assert.equal(isValidIsoDate('2026-02-30'), false);
});

test('invalid dates return false', () => {
	assert.equal(isValidIsoDate('2026-00-01'), false);
	assert.equal(isValidIsoDate('2026-13-01'), false);
	assert.equal(isValidIsoDate('2026-01-32'), false);
	assert.equal(isValidIsoDate('2026-04-31'), false);
});

test('wrong format returns false', () => {
	assert.equal(isValidIsoDate('26-04-20'), false);
	assert.equal(isValidIsoDate('2026/04/20'), false);
	assert.equal(isValidIsoDate('2026-4-20'), false);
	assert.equal(isValidIsoDate('not-a-date'), false);
});

test('null and undefined return false', () => {
	assert.equal(isValidIsoDate(null), false);
	assert.equal(isValidIsoDate(undefined), false);
	assert.equal(isValidIsoDate(''), false);
});

test('parseIsoDateList returns empty dates with no input', () => {
	assert.deepEqual(parseIsoDateList(null), { dates: [], hasInput: false });
	assert.deepEqual(parseIsoDateList(undefined), { dates: [], hasInput: false });
	assert.deepEqual(parseIsoDateList(''), { dates: [], hasInput: false });
	assert.deepEqual(parseIsoDateList('   '), { dates: [], hasInput: false });
});

test('parseIsoDateList parses a single valid date', () => {
	assert.deepEqual(parseIsoDateList('2026-04-20'), { dates: ['2026-04-20'], hasInput: true });
});

test('parseIsoDateList parses multiple comma-separated dates', () => {
	assert.deepEqual(parseIsoDateList('2026-04-20, 2026-04-22'), {
		dates: ['2026-04-20', '2026-04-22'],
		hasInput: true,
	});
});

test('parseIsoDateList removes duplicates and sorts', () => {
	assert.deepEqual(parseIsoDateList('2026-04-22, 2026-04-20, 2026-04-22'), {
		dates: ['2026-04-20', '2026-04-22'],
		hasInput: true,
	});
});

test('parseIsoDateList rejects trailing commas with comma error', () => {
	const result = parseIsoDateList('2026-04-20,');
	assert.equal(result.dates.length, 0);
	assert.equal(result.hasInput, true);
	assert.ok(result.error?.includes('comma-separated'));
});

test('parseIsoDateList rejects invalid date format', () => {
	const result = parseIsoDateList('not-a-date');
	assert.equal(result.dates.length, 0);
	assert.equal(result.hasInput, true);
	assert.ok(result.error?.includes('Invalid date'));
});

test('parseIsoDateList rejects dates exceeding the limit', () => {
	const dates = Array.from({ length: 4 }, (_, i) => `2026-05-${String(i + 1).padStart(2, '0')}`).join(', ');
	const result = parseIsoDateList(dates, 3);
	assert.equal(result.dates.length, 0);
	assert.equal(result.hasInput, true);
	assert.ok(result.error?.includes('up to 3'));
});

test('parseIsoDateList uses default limit of 30', () => {
	const dates = Array.from({ length: 30 }, (_, i) => `2026-05-${String(i + 1).padStart(2, '0')}`).join(', ');
	const result = parseIsoDateList(dates);
	assert.equal(result.hasInput, true);
	assert.equal(result.dates.length, 30);
});
