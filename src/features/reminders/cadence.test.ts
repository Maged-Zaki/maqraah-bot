import assert from 'node:assert/strict';
import test from 'node:test';
import sqlite3 from 'sqlite3';
import { ReminderEventsRepository } from '../../infrastructure/database/repositories/ReminderEventsRepository';
import { buildReminderStageSchedules, isValidTimeZone, reminderStages } from './cadence';

test('pre-reminder schedules at the correct local time', () => {
	const schedules = buildReminderStageSchedules({
		roleId: 'role-id',
		dailyTime: '1:00 PM',
		timezone: 'Africa/Cairo',
		voiceChannelId: '',
		preReminderEnabled: 1,
		preReminderOffsetMinutes: 5,
		mainReminderEnabled: 1,
	});

	const preReminder = schedules.find((schedule) => schedule.stage === reminderStages.PRE);

	assert.equal(preReminder?.cronTime, '55 12 * * *');
	assert.equal(preReminder?.sessionDateOffsetMinutes, 5);
});

test('pre-reminder rolls back to the previous local day when needed', () => {
	const schedules = buildReminderStageSchedules({
		roleId: 'role-id',
		dailyTime: '12:03 AM',
		timezone: 'Africa/Cairo',
		voiceChannelId: '',
		preReminderEnabled: 1,
		preReminderOffsetMinutes: 5,
		mainReminderEnabled: 0,
	});

	assert.equal(schedules[0]?.cronTime, '58 23 * * *');
});

test('disabled reminder stages are skipped', () => {
	const schedules = buildReminderStageSchedules({
		roleId: 'role-id',
		dailyTime: '1:00 PM',
		timezone: 'Africa/Cairo',
		voiceChannelId: '',
		preReminderEnabled: 0,
		preReminderOffsetMinutes: 5,
		mainReminderEnabled: 1,
	});

	assert.deepEqual(
		schedules.map((schedule) => schedule.stage),
		[reminderStages.MAIN]
	);
});

test('duplicate reminder events are ignored after restart', async () => {
	const db = new sqlite3.Database(':memory:');
	await run(
		db,
		`
			CREATE TABLE reminder_events (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				sessionId TEXT NOT NULL,
				stage TEXT NOT NULL,
				scheduledFor TEXT NOT NULL,
				sentAt TEXT NOT NULL,
				UNIQUE(sessionId, stage)
			)
		`
	);

	try {
		const repository = new ReminderEventsRepository(db);
		const firstRecord = await repository.recordSentEventIfNew('2026-04-15', reminderStages.PRE, '2026-04-15T10:55:00.000Z');
		const secondRecord = await repository.recordSentEventIfNew('2026-04-15', reminderStages.PRE, '2026-04-15T10:55:00.000Z');
		const differentStage = await repository.recordSentEventIfNew(
			'2026-04-15',
			reminderStages.MAIN,
			'2026-04-15T11:00:00.000Z'
		);

		assert.equal(firstRecord, true);
		assert.equal(secondRecord, false);
		assert.equal(differentStage, true);
	} finally {
		await close(db);
	}
});

test('timezone validation rejects clock times', () => {
	assert.equal(isValidTimeZone('Africa/Cairo'), true);
	assert.equal(isValidTimeZone('7:26 PM'), false);
});

function run(db: sqlite3.Database, sql: string): Promise<void> {
	return new Promise((resolve, reject) => {
		db.run(sql, (err) => {
			if (err) {
				reject(err);
			} else {
				resolve();
			}
		});
	});
}

function close(db: sqlite3.Database): Promise<void> {
	return new Promise((resolve, reject) => {
		db.close((err) => {
			if (err) {
				reject(err);
			} else {
				resolve();
			}
		});
	});
}
