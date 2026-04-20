import assert from 'node:assert/strict';
import test from 'node:test';
import type { Schedule } from '../../storage/sqlite/repositories/ScheduleRepository';

process.env.DATABASE_PATH ??= ':memory:';
process.env.CHANNEL_ID ??= 'reminder-channel';

const { configurationRepository, scheduleRepository } = require('../../storage/sqlite') as typeof import('../../storage/sqlite');
const { scheduleStatuses, scheduleTypes } = require('../../storage/sqlite/repositories/ScheduleRepository') as typeof import('../../storage/sqlite/repositories/ScheduleRepository');
const { executeGenericSchedule } = require('./scheduler') as typeof import('./scheduler');

test('generic scheduler sends active recurring schedules on selected weekdays', { concurrency: false }, async () => {
	const sentPayloads: any[] = [];
	const recordedRuns: number[] = [];

	await withRepositoryMocks(
		{
			getConfiguration: async () => ({ timezone: 'UTC' }),
			getScheduleById: async () =>
				buildSchedule({
					id: 10,
					weekdays: '1,4',
					time: '7:30 PM',
					message: '<@&role-1> Team meeting starts soon.',
					mentionUserIds: '123,456',
				}),
			recordScheduleRun: async (id: number) => {
				recordedRuns.push(id);
			},
		},
		async () => {
			await executeGenericSchedule(createClient(sentPayloads) as any, 10, new Date('2026-04-20T19:30:00.000Z'));
		}
	);

	assert.deepEqual(recordedRuns, [10]);
	assert.equal(sentPayloads[0].content, '<@123> <@456>\n<@&role-1> Team meeting starts soon.');
	assert.deepEqual(sentPayloads[0].allowedMentions, { parse: ['users', 'roles'] });
});

test('generic scheduler skips recurring schedules on unselected weekdays', { concurrency: false }, async () => {
	const sentPayloads: any[] = [];
	const recordedRuns: number[] = [];

	await withRepositoryMocks(
		{
			getConfiguration: async () => ({ timezone: 'UTC' }),
			getScheduleById: async () => buildSchedule({ id: 10, weekdays: '1', time: '7:30 PM' }),
			recordScheduleRun: async (id: number) => {
				recordedRuns.push(id);
			},
		},
		async () => {
			await executeGenericSchedule(createClient(sentPayloads) as any, 10, new Date('2026-04-21T19:30:00.000Z'));
		}
	);

	assert.deepEqual(sentPayloads, []);
	assert.deepEqual(recordedRuns, []);
});

test('generic scheduler completes one-time schedules after sending', { concurrency: false }, async () => {
	const sentPayloads: any[] = [];
	const completedSchedules: number[] = [];

	await withRepositoryMocks(
		{
			getConfiguration: async () => ({ timezone: 'UTC' }),
			getScheduleById: async () =>
				buildSchedule({
					id: 20,
					type: scheduleTypes.ONE_TIME,
					weekdays: null,
					oneTimeDate: '2026-04-20',
					time: '7:30 PM',
				}),
			recordScheduleRun: async () => undefined,
			markScheduleCompleted: async (id: number) => {
				completedSchedules.push(id);
			},
		},
		async () => {
			await executeGenericSchedule(createClient(sentPayloads) as any, 20, new Date('2026-04-20T19:30:00.000Z'));
		}
	);

	assert.equal(sentPayloads.length, 1);
	assert.match(sentPayloads[0].content, /^<@123>/);
	assert.deepEqual(completedSchedules, [20]);
});

async function withRepositoryMocks(overrides: any, callback: () => Promise<void>): Promise<void> {
	const originalGetConfiguration = configurationRepository.getConfiguration;
	const originalGetScheduleById = scheduleRepository.getScheduleById;
	const originalRecordScheduleRun = scheduleRepository.recordScheduleRun;
	const originalMarkScheduleCompleted = scheduleRepository.markScheduleCompleted;

	if (overrides.getConfiguration) {
		configurationRepository.getConfiguration = overrides.getConfiguration;
	}
	if (overrides.getScheduleById) {
		scheduleRepository.getScheduleById = overrides.getScheduleById;
	}
	if (overrides.recordScheduleRun) {
		scheduleRepository.recordScheduleRun = overrides.recordScheduleRun;
	}
	if (overrides.markScheduleCompleted) {
		scheduleRepository.markScheduleCompleted = overrides.markScheduleCompleted;
	}

	try {
		await callback();
	} finally {
		configurationRepository.getConfiguration = originalGetConfiguration;
		scheduleRepository.getScheduleById = originalGetScheduleById;
		scheduleRepository.recordScheduleRun = originalRecordScheduleRun;
		scheduleRepository.markScheduleCompleted = originalMarkScheduleCompleted;
	}
}

function createClient(sentPayloads: any[]) {
	return {
		channels: {
			cache: new Map([
				[
					'reminder-channel',
					{
						send: async (payload: any) => {
							sentPayloads.push(payload);
						},
					},
				],
			]),
		},
	};
}

function buildSchedule(schedule: Partial<Schedule>): Schedule {
	return {
		id: 1,
		name: 'Team meeting',
		nameKey: 'team meeting',
		type: scheduleTypes.RECURRING,
		weekdays: '1,4',
		oneTimeDate: null,
		time: '7:30 PM',
		message: 'Team meeting starts soon.',
		mentionUserIds: '123',
		status: scheduleStatuses.ACTIVE,
		creatorUserId: 'user-1',
		createdAt: '2026-04-15T12:00:00.000Z',
		updatedAt: '2026-04-15T12:00:00.000Z',
		lastRunAt: null,
		...schedule,
	};
}
