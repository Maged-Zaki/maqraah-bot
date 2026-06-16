import sqlite3 from 'sqlite3';
import type { Migration } from './types';

export const migration004: Migration = {
	name: '004_hifz_weekdays',

	async up(db: sqlite3.Database): Promise<void> {
		await run(db, `ALTER TABLE configuration ADD COLUMN hifzWeekdays TEXT`);
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