import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidTimeZone, minutesToCron, normalizeReminderTime, normalizeTimeZone, parseReminderTime, parseTimeToCron, parseTimeToMinutes } from './time';

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

test('parseReminderTime returns display time, cron, and minutes', () => {
	const result = parseReminderTime('9:05 PM');
	assert.notEqual(result, null);
	assert.equal(result!.displayTime, '9:05 PM');
	assert.equal(result!.cronTime, '5 21 * * *');
	assert.equal(result!.minutesSinceMidnight, 21 * 60 + 5);
});

test('parseReminderTime handles midnight and noon boundaries', () => {
	const midnight = parseReminderTime('12:00 AM');
	assert.notEqual(midnight, null);
	assert.equal(midnight!.minutesSinceMidnight, 0);

	const noon = parseReminderTime('12:00 PM');
	assert.notEqual(noon, null);
	assert.equal(noon!.minutesSinceMidnight, 12 * 60);
});

test('parseReminderTime handles 11:59 PM as the last minute', () => {
	const result = parseReminderTime('11:59 PM');
	assert.notEqual(result, null);
	assert.equal(result!.minutesSinceMidnight, 23 * 60 + 59);
});

test('parseReminderTime handles 1:00 AM', () => {
	const result = parseReminderTime('1:00 AM');
	assert.notEqual(result, null);
	assert.equal(result!.minutesSinceMidnight, 60);
	assert.equal(result!.displayTime, '1:00 AM');
});

test('parseReminderTime returns null for null undefined and empty', () => {
	assert.equal(parseReminderTime(null), null);
	assert.equal(parseReminderTime(undefined), null);
	assert.equal(parseReminderTime(''), null);
});

test('parseReminderTime rejects hour 0', () => {
	assert.equal(parseReminderTime('0:30 AM'), null);
});

test('parseReminderTime rejects minutes over 59', () => {
	assert.equal(parseReminderTime('10:60 PM'), null);
});

test('parseTimeToMinutes converts valid times to minutes since midnight', () => {
	assert.equal(parseTimeToMinutes('12:00 AM'), 0);
	assert.equal(parseTimeToMinutes('1:00 AM'), 60);
	assert.equal(parseTimeToMinutes('12:00 PM'), 720);
	assert.equal(parseTimeToMinutes('11:59 PM'), 1439);
});

test('parseTimeToMinutes returns null for invalid input', () => {
	assert.equal(parseTimeToMinutes('invalid'), null);
	assert.equal(parseTimeToMinutes(null), null);
});

test('minutesToCron converts minutes to a cron expression', () => {
	assert.equal(minutesToCron(0), '0 0 * * *');
	assert.equal(minutesToCron(65), '5 1 * * *');
	assert.equal(minutesToCron(720), '0 12 * * *');
	assert.equal(minutesToCron(1439), '59 23 * * *');
});

test('minutesToCron wraps negative values modulo 1440', () => {
	assert.equal(minutesToCron(-1), '59 23 * * *');
	assert.equal(minutesToCron(-60), '0 23 * * *');
});

test('minutesToCron wraps values over 1440', () => {
	assert.equal(minutesToCron(1440), '0 0 * * *');
	assert.equal(minutesToCron(1500), '0 1 * * *');
});

test('timezone validation handles null undefined and empty', () => {
	assert.equal(isValidTimeZone(null), false);
	assert.equal(isValidTimeZone(undefined), false);
	assert.equal(isValidTimeZone(''), false);
	assert.equal(isValidTimeZone('   '), false);
});

test('timezone validation accepts UTC', () => {
	assert.equal(isValidTimeZone('UTC'), true);
});

test('timezone normalization returns null for non-string input', () => {
	assert.equal(normalizeTimeZone(null), null);
	assert.equal(normalizeTimeZone(undefined), null);
});
