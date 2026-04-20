import assert from 'node:assert/strict';
import test from 'node:test';
import sqlite3 from 'sqlite3';
import { ScheduleRepository, scheduleStatuses, scheduleTypes } from './ScheduleRepository';

test('schedules can be created, read, updated, and deleted by name', async () => {
	const { db, repository } = await createRepository();

	try {
		const created = await repository.createSchedule({
			name: ' Team   Meeting ',
			type: scheduleTypes.RECURRING,
			weekdays: '1,4',
			time: '7:30 PM',
			message: 'Team meeting starts soon.',
			mentionUserIds: '123,456',
			creatorUserId: 'user-1',
		});

		assert.equal(created.name, 'Team Meeting');
		assert.equal(created.nameKey, 'team meeting');
		assert.equal(created.mentionUserIds, '123,456');

		const updated = await repository.updateScheduleById(created.id, {
			name: 'Planning',
			weekdays: '2',
			time: '8:00 PM',
			message: 'Planning starts soon.',
			mentionUserIds: '789',
		});

		assert.equal(updated?.name, 'Planning');
		assert.equal(updated?.weekdays, '2');
		assert.equal(updated?.mentionUserIds, '789');
		assert.equal((await repository.getScheduleByName('planning'))?.message, 'Planning starts soon.');

		const deleted = await repository.deleteScheduleByName('PLANNING');
		assert.equal(deleted, true);
		assert.equal(await repository.getScheduleByName('planning'), null);
	} finally {
		await close(db);
	}
});

test('schedule names are unique case-insensitively', async () => {
	const { db, repository } = await createRepository();

	try {
		await repository.createSchedule({
			name: 'Team Meeting',
			type: scheduleTypes.RECURRING,
			weekdays: '1',
			time: '7:30 PM',
			message: 'Team meeting starts soon.',
			mentionUserIds: '123',
			creatorUserId: 'user-1',
		});

		await assert.rejects(
			() =>
				repository.createSchedule({
					name: 'team meeting',
					type: scheduleTypes.RECURRING,
					weekdays: '2',
					time: '8:00 PM',
					message: 'Another meeting.',
					mentionUserIds: '456',
					creatorUserId: 'user-2',
				}),
			/UNIQUE constraint failed|SQLITE_CONSTRAINT/
		);
	} finally {
		await close(db);
	}
});

test('completed schedules are excluded from active schedule lists', async () => {
	const { db, repository } = await createRepository();

	try {
		const active = await repository.createSchedule({
			name: 'Active',
			type: scheduleTypes.ONE_TIME,
			oneTimeDate: '2026-04-20',
			time: '7:30 PM',
			message: 'Active reminder.',
			mentionUserIds: '123',
			creatorUserId: 'user-1',
		});
		const completed = await repository.createSchedule({
			name: 'Completed',
			type: scheduleTypes.ONE_TIME,
			oneTimeDate: '2026-04-21',
			time: '7:30 PM',
			message: 'Completed reminder.',
			mentionUserIds: '456',
			creatorUserId: 'user-1',
		});

		await repository.markScheduleCompleted(completed.id);
		await repository.recordScheduleRun(active.id, '2026-04-20T19:30:00.000Z');

		const schedules = await repository.getActiveSchedules();
		assert.deepEqual(
			schedules.map((schedule) => schedule.name),
			['Active']
		);
		assert.equal(schedules[0].lastRunAt, '2026-04-20T19:30:00.000Z');
		assert.equal((await repository.getScheduleById(completed.id))?.status, scheduleStatuses.COMPLETED);
	} finally {
		await close(db);
	}
});

async function createRepository(): Promise<{ db: sqlite3.Database; repository: ScheduleRepository }> {
	const db = new sqlite3.Database(':memory:');
	await run(
		db,
		`
			CREATE TABLE schedules (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL,
				nameKey TEXT NOT NULL UNIQUE,
				type TEXT NOT NULL,
				weekdays TEXT,
				oneTimeDate TEXT,
				time TEXT NOT NULL,
				message TEXT NOT NULL,
				mentionUserIds TEXT NOT NULL DEFAULT '',
				status TEXT DEFAULT 'active',
				creatorUserId TEXT NOT NULL,
				createdAt TEXT NOT NULL,
				updatedAt TEXT NOT NULL,
				lastRunAt TEXT
			)
		`
	);

	return { db, repository: new ScheduleRepository(db) };
}

function run(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<void> {
	return new Promise((resolve, reject) => {
		db.run(sql, params, (err) => {
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
