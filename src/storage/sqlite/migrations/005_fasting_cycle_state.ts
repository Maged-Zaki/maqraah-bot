import sqlite3 from 'sqlite3';
import type { Migration } from './types';

export const migration005: Migration = {
	name: '005_fasting_cycle_state',

	async up(db: sqlite3.Database): Promise<void> {
		await run(db, `
			CREATE TABLE IF NOT EXISTS fasting_cycle_state (
				cycleKey TEXT PRIMARY KEY,
				lastFastedDate TEXT NOT NULL,
				updatedAt TEXT NOT NULL
			)
		`);

		await run(db, `
			INSERT OR IGNORE INTO fasting_cycle_state (cycleKey, lastFastedDate, updatedAt)
			VALUES ('dawwd-alternate', NULL, NULL)
		`);
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