import sqlite3 from 'sqlite3';
import { logger } from '../../../observability/logging/logger';

export interface Progress {
	currentPage: number;
	currentHadith: number;
}

export class ProgressRepository {
	constructor(private db: sqlite3.Database) {}

	async getProgress(): Promise<Progress> {
		const startTime = Date.now();

		try {
			const row = await this.getRow<any>('SELECT * FROM progress WHERE id = 1');
			const progress = normalizeProgress(row);
			logger.recordDatabaseEvent('read', 'progress', Date.now() - startTime, true);
			return progress;
		} catch (error) {
			const duration = Date.now() - startTime;
			logger.error('Failed to get progress', error as Error, undefined, { operationType: 'database_read', operationStatus: 'failure', duration });
			logger.recordDatabaseEvent('read', 'progress', duration, false, (error as Error).message);
			throw error;
		}
	}

	async updateProgress(updates: Partial<Progress>): Promise<void> {
		const startTime = Date.now();
		const fields = Object.keys(updates);

		if (fields.length === 0) {
			return;
		}

		const values = Object.values(updates);
		const setClause = fields.map((field) => `${field} = ?`).join(', ');

		try {
			await this.run(`UPDATE progress SET ${setClause} WHERE id = 1`, values);
			logger.recordDatabaseEvent('update', 'progress', Date.now() - startTime, true);
		} catch (error) {
			const duration = Date.now() - startTime;
			logger.error('Failed to update progress', error as Error, undefined, { operationType: 'database_update', operationStatus: 'failure', duration });
			logger.recordDatabaseEvent('update', 'progress', duration, false, (error as Error).message);
			throw error;
		}
	}

	async updateQuranProgress(currentPage: number): Promise<void> {
		const startTime = Date.now();

		try {
			await this.run('UPDATE progress SET currentPage = ? WHERE id = 1', [currentPage]);
			logger.recordDatabaseEvent('update', 'progress', Date.now() - startTime, true);
		} catch (error) {
			const duration = Date.now() - startTime;
			logger.error('Failed to update Quran progress', error as Error, undefined, {
				operationType: 'database_update',
				operationStatus: 'failure',
				duration,
			});
			logger.recordDatabaseEvent('update', 'progress', duration, false, (error as Error).message);
			throw error;
		}
	}

	private getRow<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
		return new Promise((resolve, reject) => {
			this.db.get(sql, params, (err, row: T | undefined) => {
				if (err) {
					reject(err);
					return;
				}

				resolve(row);
			});
		});
	}

	private run(sql: string, params: unknown[] = []): Promise<void> {
		return new Promise((resolve, reject) => {
			this.db.run(sql, params, (err) => {
				if (err) {
					reject(err);
					return;
				}

				resolve();
			});
		});
	}
}

function normalizeProgress(row: any): Progress {
	return {
		currentPage: normalizeCurrentPage(row?.currentPage),
		currentHadith: normalizeCurrentHadith(row?.currentHadith),
	};
}

function normalizeCurrentPage(value: unknown): number {
	if (!Number.isInteger(value)) {
		return 1;
	}

	return Math.min(Math.max(value as number, 1), 604);
}

function normalizeCurrentHadith(value: unknown): number {
	if (!Number.isInteger(value) || (value as number) <= 0) {
		return 1;
	}

	return value as number;
}
