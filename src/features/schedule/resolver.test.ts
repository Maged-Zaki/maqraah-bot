import assert from 'node:assert/strict';
import test from 'node:test';
import type { Schedule } from '../../storage/sqlite/repositories/ScheduleRepository';
import { scheduleStatuses, scheduleTypes } from '../../storage/sqlite/repositories/ScheduleRepository';
import {
	buildScheduleCronEntries,
	formatWeekdays,
	getNextScheduleRuns,
	isValidScheduleDate,
	parseStoredWeekdays,
	serializeWeekdays,
	shouldExecuteScheduleNow,
} from './resolver';

test('recurring schedules generate one cron entry per selected weekday', () => {
	const entries = buildScheduleCronEntries(
		buildSchedule({
			weekdays: serializeWeekdays([1, 4]),
			time: '7:30 PM',
		}),
		'UTC'
	);

	assert.deepEqual(
		entries.map((entry) => entry.cronTime),
		['30 19 * * 1', '30 19 * * 4']
	);
});

test('daily behavior is represented by all seven weekdays', () => {
	const schedule = buildSchedule({ weekdays: serializeWeekdays([1, 2, 3, 4, 5, 6, 7]) });

	assert.equal(formatWeekdays(parseStoredWeekdays(schedule.weekdays)), 'every day');
	assert.equal(buildScheduleCronEntries(schedule, 'UTC').length, 7);
});

test('weekdays skip weekends in next-run previews', () => {
	const schedule = buildSchedule({ weekdays: serializeWeekdays([1, 2, 3, 4, 5]), time: '7:00 PM' });
	const nextRuns = getNextScheduleRuns(schedule, 'UTC', 2, new Date('2026-04-17T20:00:00.000Z'));

	assert.deepEqual(
		nextRuns.map((run) => run.date),
		['2026-04-20', '2026-04-21']
	);
});

test('invalid or empty weekday selections are rejected by schedule resolution', () => {
	assert.deepEqual(buildScheduleCronEntries(buildSchedule({ weekdays: '', time: '7:00 PM' }), 'UTC'), []);
	assert.deepEqual(buildScheduleCronEntries(buildSchedule({ weekdays: 'not-a-day', time: '7:00 PM' }), 'UTC'), []);
});

test('one-time schedule dates and times are validated and executed once', () => {
	const schedule = buildSchedule({
		type: scheduleTypes.ONE_TIME,
		weekdays: null,
		oneTimeDate: '2026-04-20',
		time: '7:00 PM',
	});

	assert.equal(isValidScheduleDate('2026-04-20'), true);
	assert.equal(isValidScheduleDate('2026-02-31'), false);
	assert.equal(shouldExecuteScheduleNow(schedule, 'UTC', new Date('2026-04-20T19:00:00.000Z')), true);
	assert.equal(shouldExecuteScheduleNow(schedule, 'UTC', new Date('2026-04-21T19:00:00.000Z')), false);
});

function buildSchedule(schedule: Partial<Schedule>): Schedule {
	return {
		id: 1,
		name: 'Team meeting',
		nameKey: 'team meeting',
		type: scheduleTypes.RECURRING,
		weekdays: serializeWeekdays([1, 4]),
		oneTimeDate: null,
		time: '7:30 PM',
		message: 'Team meeting starts soon.',
		status: scheduleStatuses.ACTIVE,
		creatorUserId: 'user-1',
		createdAt: '2026-04-15T12:00:00.000Z',
		updatedAt: '2026-04-15T12:00:00.000Z',
		lastRunAt: null,
		...schedule,
	};
}
