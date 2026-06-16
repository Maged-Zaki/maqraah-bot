import assert from 'node:assert/strict';
import test from 'node:test';
import sqlite3 from 'sqlite3';
import { migration001 } from './001_initial_schema';
import { migration002 } from './002_hifz_progress';
import { migration003 } from './003_hifz_sync_roles_and_prayer_select';
import type { Migration } from './types';

test('fresh database migrates successfully', async () => {
	const db = new sqlite3.Database(':memory:');

	try {
		await runMigrationsWith(db, [migration001]);

		const tables = await all<{ name: string }>(
			db,
			`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
		);
		const tableNames = tables.map((t) => t.name);

		assert.ok(tableNames.includes('configuration'));
		assert.ok(tableNames.includes('progress'));
		assert.ok(tableNames.includes('notes'));
		assert.ok(tableNames.includes('attendance'));
		assert.ok(tableNames.includes('reminder_events'));
		assert.ok(tableNames.includes('attendance_announcement_messages'));
		assert.ok(tableNames.includes('schedules'));
		assert.ok(tableNames.includes('reminder_category_roles'));
		assert.ok(tableNames.includes('reminder_settings'));
		assert.ok(tableNames.includes('hijri_calendar_cache'));
		assert.ok(tableNames.includes('subscription_reminder_events'));
		assert.ok(tableNames.includes('migrations'));

		const config = await get<{ id: number }>(db, 'SELECT id FROM configuration WHERE id = 1');
		assert.equal(config?.id, 1);

		const progress = await get<{ id: number }>(db, 'SELECT id FROM progress WHERE id = 1');
		assert.equal(progress?.id, 1);

		const settings = await get<{ id: number }>(db, 'SELECT id FROM reminder_settings WHERE id = 1');
		assert.equal(settings?.id, 1);
	} finally {
		await close(db);
	}
});

test('existing database migrates without data loss', async () => {
	const db = new sqlite3.Database(':memory:');

	try {
		await run(db, `
			CREATE TABLE configuration (
				id INTEGER PRIMARY KEY DEFAULT 1,
				roleId TEXT DEFAULT 'Not set',
				dailyTime TEXT DEFAULT '12:00 PM',
				timezone TEXT DEFAULT 'Africa/Cairo',
				voiceChannelId TEXT DEFAULT '',
				preReminderEnabled INTEGER DEFAULT 1,
				preReminderOffsetMinutes INTEGER DEFAULT 5,
				mainReminderEnabled INTEGER DEFAULT 1,
				maqraahTimeSyncEnabled INTEGER DEFAULT 0,
				maqraahTimeSyncOffsetMinutes INTEGER DEFAULT 40,
				maqraahTimeSyncLatitude REAL DEFAULT 30.0444,
				maqraahTimeSyncLongitude REAL DEFAULT 31.2357,
				maqraahTimeSyncCalculationMethod INTEGER DEFAULT 5,
				welcomeSentAt TEXT
			)
		`);
		await run(db, `INSERT INTO configuration (id, roleId) VALUES (1, 'role-123')`);

		await run(db, `
			CREATE TABLE notes (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				userId TEXT NOT NULL,
				note TEXT NOT NULL,
				dateAdded TEXT NOT NULL,
				status TEXT DEFAULT 'pending',
				lastIncludedDate TEXT,
				lastIncludedSessionId TEXT,
				isAnonymous INTEGER DEFAULT 0
			)
		`);
		await run(db, `INSERT INTO notes (userId, note, dateAdded) VALUES ('user-1', 'Existing note', '2026-01-01T00:00:00.000Z')`);

		await runMigrationsWith(db, [migration001]);

		const config = await get<{ roleId: string }>(db, 'SELECT roleId FROM configuration WHERE id = 1');
		assert.equal(config?.roleId, 'role-123');

		const notes = await all<{ note: string }>(db, 'SELECT note FROM notes');
		assert.equal(notes.length, 1);
		assert.equal(notes[0].note, 'Existing note');
	} finally {
		await close(db);
	}
});

test('failed migration stops with clear error', async () => {
	const db = new sqlite3.Database(':memory:');

	try {
		const badMigration: Migration = {
			name: '999_will_fail',
			async up(db: sqlite3.Database): Promise<void> {
				await run(db, 'CREATE TABLE nope');
			},
		};

		await assert.rejects(
			() => runMigrationsWith(db, [migration001, badMigration]),
			(err) => {
				assert.ok(err instanceof Error);
				assert.ok(err.message.includes('999_will_fail'), `Error message should contain migration name: ${err.message}`);
				return true;
			},
		);

		const applied = await all<{ name: string }>(db, 'SELECT name FROM migrations');
		assert.deepEqual(
			applied.map((r) => r.name),
			['001_initial_schema'],
		);
	} finally {
		await close(db);
	}
});

test('migration 002 adds hifz_progress table and hifz configuration columns', async () => {
	const db = new sqlite3.Database(':memory:');

	try {
		await runMigrationsWith(db, [migration001, migration002]);

		const tables = await all<{ name: string }>(
			db,
			`SELECT name FROM sqlite_master WHERE type='table' AND name='hifz_progress'`,
		);
		assert.equal(tables.length, 1);

		const hifzProgress = await get<{ id: number }>(db, 'SELECT id FROM hifz_progress WHERE id = 1');
		assert.equal(hifzProgress?.id, 1);

		const config = await get<{ hifzTime: string; hifzReminderEnabled: number; hifzPreReminderEnabled: number; hifzPreReminderOffsetMinutes: number }>(
			db,
			'SELECT hifzTime, hifzReminderEnabled, hifzPreReminderEnabled, hifzPreReminderOffsetMinutes FROM configuration WHERE id = 1',
		);
		assert.equal(config?.hifzTime, '6:00 PM');
		assert.equal(config?.hifzReminderEnabled, 1);
		assert.equal(config?.hifzPreReminderEnabled, 1);
		assert.equal(config?.hifzPreReminderOffsetMinutes, 5);
	} finally {
		await close(db);
	}
});

test('migration 003 adds hifz sync columns, prayer select, and copies roleId into hifzRoleId', async () => {
	const db = new sqlite3.Database(':memory:');

	try {
		// Seed a configuration table the way migration 001 leaves it, with a real role id.
		await runMigrationsWith(db, [migration001, migration002]);
		await run(db, `UPDATE configuration SET roleId = 'role-123' WHERE id = 1`);

		await runMigrationsWith(db, [migration003]);

		const config = await get<{
			hifzEnabled: number;
			hifzRoleId: string;
			hifzTimeSyncEnabled: number;
			hifzTimeSyncPrayer: string;
			hifzTimeSyncOffsetMinutes: number;
			maqraahTimeSyncPrayer: string;
		}>(
			db,
			'SELECT hifzEnabled, hifzRoleId, hifzTimeSyncEnabled, hifzTimeSyncPrayer, hifzTimeSyncOffsetMinutes, maqraahTimeSyncPrayer FROM configuration WHERE id = 1',
		);

		assert.equal(config?.hifzEnabled, 1);
		assert.equal(config?.hifzRoleId, 'role-123');
		assert.equal(config?.hifzTimeSyncEnabled, 1);
		assert.equal(config?.hifzTimeSyncPrayer, 'dhuhr');
		assert.equal(config?.hifzTimeSyncOffsetMinutes, 90);
		assert.equal(config?.maqraahTimeSyncPrayer, 'maghrib');
	} finally {
		await close(db);
	}
});

test('runner does not reapply completed migrations', async () => {
	const db = new sqlite3.Database(':memory:');

	try {
		await runMigrationsWith(db, [migration001]);

		let upCallCount = 0;
		const trackedMigration: Migration = {
			name: '001_initial_schema',
			async up(): Promise<void> {
				upCallCount++;
			},
		};

		await runMigrationsWith(db, [trackedMigration]);

		assert.equal(upCallCount, 0);

		const applied = await all<{ name: string }>(db, 'SELECT name FROM migrations');
		assert.equal(applied.length, 1);
		assert.equal(applied[0].name, '001_initial_schema');
	} finally {
		await close(db);
	}
});

async function runMigrationsWith(db: sqlite3.Database, migrations: Migration[]): Promise<void> {
	await run(db, `
		CREATE TABLE IF NOT EXISTS migrations (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL UNIQUE,
			appliedAt TEXT NOT NULL
		)
	`);

	const appliedRows = await all<{ name: string }>(db, 'SELECT name FROM migrations');
	const appliedNames = new Set(appliedRows.map((row) => row.name));

	for (const migration of migrations) {
		if (appliedNames.has(migration.name)) {
			continue;
		}

		try {
			await run(db, 'BEGIN');
			await migration.up(db);
			await run(db, 'INSERT INTO migrations (name, appliedAt) VALUES (?, ?)', [
				migration.name,
				new Date().toISOString(),
			]);
			await run(db, 'COMMIT');
		} catch (error) {
			try {
				await run(db, 'ROLLBACK');
			} catch {
				// rollback may fail if the transaction was not started
			}

			throw new Error(`Migration "${migration.name}" failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
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

function all<T>(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<T[]> {
	return new Promise((resolve, reject) => {
		db.all(sql, params, (err, rows) => {
			if (err) {
				reject(err);
			} else {
				resolve(rows as T[]);
			}
		});
	});
}

function get<T>(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<T | undefined> {
	return new Promise((resolve, reject) => {
		db.get(sql, params, (err, row) => {
			if (err) {
				reject(err);
			} else {
				resolve(row as T | undefined);
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
