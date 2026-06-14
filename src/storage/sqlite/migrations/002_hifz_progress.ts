import sqlite3 from 'sqlite3';
import type { Migration } from './types';

export const migration002: Migration = {
	name: '002_hifz_progress',

	async up(db: sqlite3.Database): Promise<void> {
		await run(db, `ALTER TABLE configuration ADD COLUMN hifzTime TEXT DEFAULT '6:00 PM'`);
		await run(db, `ALTER TABLE configuration ADD COLUMN hifzReminderEnabled INTEGER DEFAULT 1`);
		await run(db, `ALTER TABLE configuration ADD COLUMN hifzPreReminderEnabled INTEGER DEFAULT 1`);
		await run(db, `ALTER TABLE configuration ADD COLUMN hifzPreReminderOffsetMinutes INTEGER DEFAULT 5`);

		await run(db, `
			CREATE TABLE IF NOT EXISTS hifz_progress (
				id INTEGER PRIMARY KEY DEFAULT 1,
				currentPage INTEGER DEFAULT 1
			)
		`);
		await run(db, `INSERT OR IGNORE INTO hifz_progress (id) VALUES (1)`);
	},
};

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
