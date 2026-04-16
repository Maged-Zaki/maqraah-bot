import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidTimeZone, normalizeReminderTime, normalizeTimeZone, parseTimeToCron } from './time';

test('parseTimeToCron accepts valid 12-hour reminder times', () => {
	assert.equal(parseTimeToCron('9:05 PM'), '5 21 * * *');
	assert.equal(parseTimeToCron('12:00 AM'), '0 0 * * *');
	assert.equal(parseTimeToCron('12:00 PM'), '0 12 * * *');
});

test('parseTimeToCron rejects impossible reminder times', () => {
	assert.equal(parseTimeToCron('99:99 PM'), null);
	assert.equal(parseTimeToCron('0:00 AM'), null);
	assert.equal(parseTimeToCron('13:00 PM'), null);
});

test('reminder time normalization uses one display format', () => {
	assert.equal(normalizeReminderTime('09:05 pm'), '9:05 PM');
	assert.equal(normalizeReminderTime(' 12:00  am '), '12:00 AM');
});

test('timezone validation accepts IANA zones and rejects invalid names', () => {
	assert.equal(isValidTimeZone('Africa/Cairo'), true);
	assert.equal(isValidTimeZone('America/New_York'), true);
	assert.equal(isValidTimeZone('7:26 PM'), false);
	assert.equal(isValidTimeZone('Not/A_Timezone'), false);
});

test('timezone normalization trims valid IANA zones', () => {
	assert.equal(normalizeTimeZone(' Africa/Cairo '), 'Africa/Cairo');
	assert.equal(normalizeTimeZone('africa/cairo'), 'Africa/Cairo');
	assert.equal(normalizeTimeZone('99:99 PM'), null);
});
