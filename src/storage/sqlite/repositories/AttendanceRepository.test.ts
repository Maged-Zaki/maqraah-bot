import assert from 'node:assert/strict';
import test from 'node:test';
import sqlite3 from 'sqlite3';
import { AttendanceRepository } from './AttendanceRepository';

test('attendance can be read back for one user and session', async () => {
	const { db, repository } = await createRepository();

	try {
		await repository.upsertAttendance('2026-04-15', 'user-1', 'late', null);

		const attendance = await repository.getAttendance('2026-04-15', 'user-1');

		assert.equal(attendance?.userId, 'user-1');
		assert.equal(attendance?.status, 'late');
		assert.equal(attendance?.announcedAt, null);
	} finally {
		await close(db);
	}
});

test('attendance rows are returned in updated order for a session', async () => {
	const { db, repository } = await createRepository();

	try {
		await insertAttendance(db, {
			sessionId: '2026-04-15',
			userId: 'user-2',
			status: 'cannot_make_it',
			updatedAt: '2026-04-15T10:01:00.000Z',
			announcedAt: null,
		});
		await insertAttendance(db, {
			sessionId: '2026-04-15',
			userId: 'user-1',
			status: 'late',
			updatedAt: '2026-04-15T10:00:00.000Z',
			announcedAt: null,
		});

		const attendance = await repository.getAttendanceBySessionId('2026-04-15');

		assert.deepEqual(
			attendance.map((entry) => entry.userId),
			['user-1', 'user-2']
		);
	} finally {
		await close(db);
	}
});

test('attendance can be marked announced', async () => {
	const { db, repository } = await createRepository();

	try {
		await repository.upsertAttendance('2026-04-15', 'user-1', 'late', null);
		await repository.markAttendanceAnnounced('2026-04-15', 'user-1', '2026-04-15T10:05:00.000Z');

		const attendance = await repository.getAttendance('2026-04-15', 'user-1');

		assert.equal(attendance?.announcedAt, '2026-04-15T10:05:00.000Z');
	} finally {
		await close(db);
	}
});

test('attendance can be deleted for one user and session', async () => {
	const { db, repository } = await createRepository();

	try {
		await repository.upsertAttendance('2026-04-15', 'user-1', 'late', null);

		const deleted = await repository.deleteAttendance('2026-04-15', 'user-1');
		const attendance = await repository.getAttendance('2026-04-15', 'user-1');

		assert.equal(deleted, true);
		assert.equal(attendance, null);
	} finally {
		await close(db);
	}
});

async function createRepository(): Promise<{ db: sqlite3.Database; repository: AttendanceRepository }> {
	const db = new sqlite3.Database(':memory:');
	await run(
		db,
		`
			CREATE TABLE attendance (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				sessionId TEXT NOT NULL,
				userId TEXT NOT NULL,
				status TEXT NOT NULL,
				updatedAt TEXT NOT NULL,
				announcedAt TEXT,
				UNIQUE(sessionId, userId)
			)
		`
	);

	return { db, repository: new AttendanceRepository(db) };
}

function insertAttendance(
	db: sqlite3.Database,
	attendance: {
		sessionId: string;
		userId: string;
		status: string;
		updatedAt: string;
		announcedAt: string | null;
	}
): Promise<void> {
	return run(
		db,
		`INSERT INTO attendance (sessionId, userId, status, updatedAt, announcedAt) VALUES (?, ?, ?, ?, ?)`,
		[attendance.sessionId, attendance.userId, attendance.status, attendance.updatedAt, attendance.announcedAt]
	);
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
