import sqlite3 from 'sqlite3';
import type { Migration } from './types';

export const migration003: Migration = {
	name: '003_hifz_sync_roles_and_prayer_select',

	async up(db: sqlite3.Database): Promise<void> {
		await run(db, `ALTER TABLE configuration ADD COLUMN hifzEnabled INTEGER DEFAULT 1`);
		await run(db, `ALTER TABLE configuration ADD COLUMN hifzRoleId TEXT DEFAULT 'Not set'`);
		await run(db, `ALTER TABLE configuration ADD COLUMN hifzTimeSyncEnabled INTEGER DEFAULT 1`);
		await run(db, `ALTER TABLE configuration ADD COLUMN hifzTimeSyncPrayer TEXT DEFAULT 'dhuhr'`);
		await run(db, `ALTER TABLE configuration ADD COLUMN hifzTimeSyncOffsetMinutes INTEGER DEFAULT 90`);
		await run(db, `ALTER TABLE configuration ADD COLUMN maqraahTimeSyncPrayer TEXT DEFAULT 'maghrib'`);

		// Back-compat: seed the hifz role from the existing maqraah role so reminders keep working.
		await run(db, `UPDATE configuration SET hifzRoleId = roleId WHERE hifzRoleId IS NULL OR hifzRoleId = '' OR hifzRoleId = 'Not set'`);
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
