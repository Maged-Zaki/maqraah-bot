import sqlite3 from 'sqlite3';
import type { Migration } from './types';
import { migration001 } from './001_initial_schema';
import { migration002 } from './002_hifz_progress';
import { migration003 } from './003_hifz_sync_roles_and_prayer_select';
import { logger } from '../../../observability/logging/logger';

const migrations: Migration[] = [
	migration001,
	migration002,
	migration003,
];

export async function runMigrations(db: sqlite3.Database): Promise<void> {
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

		logger.info(`Running migration: ${migration.name}`);
		const startTime = Date.now();

		try {
			await run(db, 'BEGIN');
			await migration.up(db);
			await run(db, 'INSERT INTO migrations (name, appliedAt) VALUES (?, ?)', [
				migration.name,
				new Date().toISOString(),
			]);
			await run(db, 'COMMIT');

			const duration = Date.now() - startTime;
			logger.info(`Migration completed: ${migration.name}`, undefined, {
				operationType: 'migration',
				operationStatus: 'success',
				duration,
			});
		} catch (error) {
			try {
				await run(db, 'ROLLBACK');
			} catch (_rollbackError) {
				logger.error('Failed to rollback migration', error instanceof Error ? error : new Error(String(error)));
			}

			const duration = Date.now() - startTime;
			logger.error(`Migration failed: ${migration.name}`, error instanceof Error ? error : new Error(String(error)), undefined, {
				operationType: 'migration',
				operationStatus: 'failure',
				duration,
			});

			throw new Error(`Migration "${migration.name}" failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	logger.info('All migrations completed', undefined, {
		operationType: 'migration',
		operationStatus: 'success',
		additionalData: { totalMigrations: migrations.length },
	});
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
