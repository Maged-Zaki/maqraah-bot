import assert from 'node:assert/strict';
import test from 'node:test';
import {
	buildAlAdhanTimingsUrl,
	buildPrayerSyncTiming,
	getPrayerSyncOffsetMinutes,
	isPrayerSyncEnabled,
	isValidCalculationMethod,
	isValidLatitude,
	isValidLongitude,
	minutesToDisplayTime,
	parsePrayerTimeToMinutes,
	prayerSyncDefaults,
} from './timings';
import type { Configuration } from '../../storage/sqlite/repositories/ConfigurationRepository';

test('buildPrayerSyncTiming rounds the prayer down to a 5-minute bucket and adds the offset', () => {
	const timing = buildPrayerSyncTiming('15-04-2026', 'dhuhr', '12:03', 90);
	assert.equal(timing.prayer, 'dhuhr');
	assert.equal(timing.prayerTime, '12:03 PM');
	assert.equal(timing.roundedPrayerTime, '12:00 PM');
	assert.equal(timing.reminderTime, '1:30 PM');
});

test('buildPrayerSyncTiming wraps past midnight when offset crosses the day boundary', () => {
	const timing = buildPrayerSyncTiming('15-04-2026', 'isha', '23:58', 10);
	assert.equal(timing.reminderTime, '12:05 AM');
});

test('buildPrayerSyncTiming honours a custom bucket size', () => {
	const timing = buildPrayerSyncTiming('15-04-2026', 'maghrib', '18:32', 0, 15);
	assert.equal(timing.roundedPrayerTime, '6:30 PM');
	assert.equal(timing.reminderTime, '6:30 PM');
});

test('isPrayerSyncEnabled returns the default for missing values', () => {
	assert.equal(isPrayerSyncEnabled(undefined), false);
	assert.equal(isPrayerSyncEnabled(undefined, true), true);
	assert.equal(isPrayerSyncEnabled(1), true);
	assert.equal(isPrayerSyncEnabled(0), false);
	assert.equal(isPrayerSyncEnabled('false'), false);
	assert.equal(isPrayerSyncEnabled(true), true);
});

test('getPrayerSyncOffsetMinutes falls back to a configurable default', () => {
	assert.equal(getPrayerSyncOffsetMinutes(undefined), prayerSyncDefaults.offsetMinutes);
	assert.equal(getPrayerSyncOffsetMinutes(undefined, 90), 90);
	assert.equal(getPrayerSyncOffsetMinutes(45, 90), 45);
	assert.equal(getPrayerSyncOffsetMinutes(-3, 90), 90);
	assert.equal(getPrayerSyncOffsetMinutes(2.5, 90), 90);
});

test('validators reject out-of-range location values', () => {
	assert.equal(isValidLatitude(90), true);
	assert.equal(isValidLatitude(-91), false);
	assert.equal(isValidLongitude(180), true);
	assert.equal(isValidLongitude(-181), false);
	assert.equal(isValidCalculationMethod(5), true);
	assert.equal(isValidCalculationMethod(-1), false);
});

test('parsePrayerTimeToMinutes and minutesToDisplayTime round-trip', () => {
	assert.equal(parsePrayerTimeToMinutes('13:05 (EET)'), 785);
	assert.equal(minutesToDisplayTime(785), '1:05 PM');
	assert.equal(parsePrayerTimeToMinutes('nope'), null);
});

test('buildAlAdhanTimingsUrl encodes location, method and timezone', () => {
	const url = new URL(buildAlAdhanTimingsUrl(buildConfiguration({ timezone: 'Africa/Cairo' }), '15-04-2026'));
	assert.equal(url.searchParams.get('latitude'), '30.0444');
	assert.equal(url.searchParams.get('longitude'), '31.2357');
	assert.equal(url.searchParams.get('method'), '5');
	assert.equal(url.searchParams.get('timezonestring'), 'Africa/Cairo');
});

function buildConfiguration(config: Partial<Configuration>): Configuration {
	return {
		roleId: 'role-id',
		dailyTime: '1:00 PM',
		timezone: 'UTC',
		voiceChannelId: '',
		preReminderEnabled: 1,
		preReminderOffsetMinutes: 5,
		mainReminderEnabled: 1,
		maqraahTimeSyncEnabled: 0,
		maqraahTimeSyncOffsetMinutes: 30,
		maqraahTimeSyncLatitude: 30.0444,
		maqraahTimeSyncLongitude: 31.2357,
		maqraahTimeSyncCalculationMethod: 5,
		welcomeSentAt: null,
		...config,
	};
}
