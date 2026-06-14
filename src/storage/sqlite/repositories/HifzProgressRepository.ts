import sqlite3 from 'sqlite3';
import { logger } from '../../../observability/logging/logger';

export interface HifzProgress {
	currentPage: number;
}

export class HifzProgressRepository {
	constructor(private db: sqlite3.Database) {}

	async getProgress(): Promise<HifzProgress> {
		const startTime = Date.now();

		try {
			const row = await this.getRow<any>('SELECT * FROM hifz_progress WHERE id = 1');
			const progress = normalizeHifzProgress(row);
			logger.recordDatabaseEvent('read', 'hifz_progress', Date.now() - startTime, true);
			return progress;
		} catch (error) {
			const duration = Date.now() - startTime;
			logger.error('Failed to get hifz progress', error as Error, undefined, { operationType: 'database_read', operationStatus: 'failure', duration });
			logger.recordDatabaseEvent('read', 'hifz_progress', duration, false, (error as Error).message);
			throw error;
		}
	}

	async updateQuranProgress(currentPage: number): Promise<void> {
		const startTime = Date.now();

		try {
			await this.run('UPDATE hifz_progress SET currentPage = ? WHERE id = 1', [currentPage]);
			logger.recordDatabaseEvent('update', 'hifz_progress', Date.now() - startTime, true);
		} catch (error) {
			const duration = Date.now() - startTime;
			logger.error('Failed to update hifz progress', error as Error, undefined, {
				operationType: 'database_update',
				operationStatus: 'failure',
				duration,
			});
			logger.recordDatabaseEvent('update', 'hifz_progress', duration, false, (error as Error).message);
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

function normalizeHifzProgress(row: any): HifzProgress {
	return {
		currentPage: normalizeCurrentPage(row?.currentPage),
	};
}

function normalizeCurrentPage(value: unknown): number {
	if (!Number.isInteger(value)) {
		return 1;
	}

	return Math.min(Math.max(value as number, 1), 604);
}
