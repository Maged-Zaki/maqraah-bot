import sqlite3 from 'sqlite3';
import { logger } from '../../../observability/logging/logger';
import { getQuranPageUpdateMetrics } from '../../../shared/quran/progress';

export interface Progress {
	lastPage: number;
	lastHadith: number;
	khatmahCycleCount: number;
}

export interface QuranProgressHistoryEntry {
	id: number;
	lastPage: number;
	khatmahCycleCount: number;
	pagesAdvanced: number;
	recordedAt: string;
}

export interface QuranProgressUpdateResult {
	previousProgress: Progress;
	progress: Progress;
	wrapped: boolean;
	completedKhatmah: boolean;
	pagesAdvanced: number;
	historyRecorded: boolean;
	correctedBackward: boolean;
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

	async getRecentQuranProgressHistory(limit: number = 5): Promise<QuranProgressHistoryEntry[]> {
		const startTime = Date.now();
		const safeLimit = Math.max(1, limit);

		try {
			const rows = await this.allRows<any>(
				`
					SELECT id, lastPage, khatmahCycleCount, pagesAdvanced, recordedAt
					FROM quran_progress_history
					ORDER BY recordedAt DESC, id DESC
					LIMIT ?
				`,
				[safeLimit]
			);
			const history = rows.map(normalizeHistoryEntry).reverse();
			logger.recordDatabaseEvent('read', 'quran_progress_history', Date.now() - startTime, true);
			return history;
		} catch (error) {
			const duration = Date.now() - startTime;
			logger.error('Failed to get recent Quran progress history', error as Error, undefined, {
				operationType: 'database_read',
				operationStatus: 'failure',
				duration,
			});
			logger.recordDatabaseEvent('read', 'quran_progress_history', duration, false, (error as Error).message);
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

	async updateQuranProgress(lastPage: number, recordedAt: string = new Date().toISOString()): Promise<QuranProgressUpdateResult> {
		const startTime = Date.now();

		try {
			await this.run('BEGIN IMMEDIATE TRANSACTION');
			const previousProgress = normalizeProgress(await this.getRow<any>('SELECT * FROM progress WHERE id = 1'));
			const metrics = getQuranPageUpdateMetrics(previousProgress.lastPage, lastPage, previousProgress.khatmahCycleCount);
			const progress: Progress = {
				...previousProgress,
				lastPage,
				khatmahCycleCount: metrics.nextCycleCount,
			};

			await this.run('UPDATE progress SET lastPage = ?, khatmahCycleCount = ? WHERE id = 1', [progress.lastPage, progress.khatmahCycleCount]);

			if (metrics.shouldRecordHistory) {
				await this.run(
					`
						INSERT INTO quran_progress_history (lastPage, khatmahCycleCount, pagesAdvanced, recordedAt)
						VALUES (?, ?, ?, ?)
					`,
					[progress.lastPage, progress.khatmahCycleCount, metrics.pagesAdvanced, recordedAt]
				);
			}

			await this.run('COMMIT');

			logger.recordDatabaseEvent('update', 'progress', Date.now() - startTime, true);
			return {
				previousProgress,
				progress,
				wrapped: metrics.wrapped,
				completedKhatmah: metrics.completedKhatmah,
				pagesAdvanced: metrics.pagesAdvanced,
				historyRecorded: metrics.shouldRecordHistory,
				correctedBackward: metrics.correctedBackward,
			};
		} catch (error) {
			const duration = Date.now() - startTime;
			await this.rollbackTransaction();
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

	private allRows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
		return new Promise((resolve, reject) => {
			this.db.all(sql, params, (err, rows: T[]) => {
				if (err) {
					reject(err);
					return;
				}

				resolve(rows);
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

	private async rollbackTransaction(): Promise<void> {
		try {
			await this.run('ROLLBACK');
		} catch (rollbackError) {
			logger.error('Failed to roll back Quran progress transaction', rollbackError as Error);
		}
	}
}

function normalizeProgress(row: any): Progress {
	return {
		lastPage: Number.isInteger(row?.lastPage) ? row.lastPage : 0,
		lastHadith: Number.isInteger(row?.lastHadith) ? row.lastHadith : 0,
		khatmahCycleCount: Number.isInteger(row?.khatmahCycleCount) ? row.khatmahCycleCount : 0,
	};
}

function normalizeHistoryEntry(row: any): QuranProgressHistoryEntry {
	return {
		id: Number.isInteger(row?.id) ? row.id : 0,
		lastPage: Number.isInteger(row?.lastPage) ? row.lastPage : 0,
		khatmahCycleCount: Number.isInteger(row?.khatmahCycleCount) ? row.khatmahCycleCount : 0,
		pagesAdvanced: Number.isInteger(row?.pagesAdvanced) ? row.pagesAdvanced : 0,
		recordedAt: typeof row?.recordedAt === 'string' ? row.recordedAt : '',
	};
}
