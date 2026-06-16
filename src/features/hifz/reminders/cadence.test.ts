import assert from 'node:assert/strict';
import test from 'node:test';
import type { Configuration } from '../../../storage/sqlite/repositories/ConfigurationRepository';
import { buildHifzReminderStageSchedules, hifzReminderStages } from './cadence';

test('hifz pre-reminder schedules at the correct local time', () => {
	const schedules = buildHifzReminderStageSchedules(buildConfiguration({ hifzTime: '1:00 PM', hifzPreReminderOffsetMinutes: 5, hifzWeekdays: '1,4' }));

	const preReminder = schedules.find((schedule) => schedule.stage === hifzReminderStages.PRE);

	assert.equal(preReminder?.cronTime, '55 12 * * 1,4');
	assert.equal(preReminder?.sessionDateOffsetMinutes, 5);
});

test('hifz pre-reminder uses the default time when none configured', () => {
	const schedules = buildHifzReminderStageSchedules(buildConfiguration({ hifzWeekdays: '1,4' }));

	const preReminder = schedules.find((schedule) => schedule.stage === hifzReminderStages.PRE);
	// default 6:00 PM = 18:00, minus default 5 minutes = 17:55, weekdays 1,4
	assert.equal(preReminder?.cronTime, '55 17 * * 1,4');
});

test('hifz pre-reminder rolls back to the previous local day when needed', () => {
	const schedules = buildHifzReminderStageSchedules(
		buildConfiguration({ hifzTime: '12:03 AM', hifzPreReminderOffsetMinutes: 5, hifzReminderEnabled: 0, hifzWeekdays: '1' })
	);

	assert.equal(schedules[0]?.cronTime, '58 23 * * 1');
});

test('disabled hifz reminder stages are skipped', () => {
	const schedules = buildHifzReminderStageSchedules(
		buildConfiguration({ hifzTime: '1:00 PM', hifzPreReminderEnabled: 0, hifzReminderEnabled: 1, hifzWeekdays: '2' })
	);

	assert.deepEqual(
		schedules.map((schedule) => schedule.stage),
		[hifzReminderStages.MAIN]
	);
});

test('invalid hifz time yields no schedules', () => {
	const schedules = buildHifzReminderStageSchedules(buildConfiguration({ hifzTime: 'not a time', hifzWeekdays: '1' }));

	assert.deepEqual(schedules, []);
});

test('missing hifz weekdays yields no schedules', () => {
	const schedules = buildHifzReminderStageSchedules(buildConfiguration({ hifzTime: '1:00 PM' }));

	assert.deepEqual(schedules, []);
});

function buildConfiguration(configuration: Partial<Configuration>): Configuration {
	return {
		roleId: 'role-id',
		dailyTime: '1:00 PM',
		timezone: 'Africa/Cairo',
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
		hifzEnabled: 1,
		hifzRoleId: 'role-id',
		hifzTime: '6:00 PM',
		hifzReminderEnabled: 1,
		hifzPreReminderEnabled: 1,
		hifzPreReminderOffsetMinutes: 5,
		hifzTimeSyncEnabled: 1,
		hifzTimeSyncPrayer: 'dhuhr',
		hifzTimeSyncOffsetMinutes: 90,
		hifzWeekdays: '',
		...configuration,
	};
}