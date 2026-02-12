import sqlite3 from 'sqlite3';
import { logger } from '../logger';

export interface Progress {
	lastPage: number;
	lastHadith: number;
}

export class ProgressRepository {
	constructor(private db: sqlite3.Database) {}

	async getProgress(): Promise<Progress> {
		const startTime = Date.now();
		return new Promise((resolve, reject) => {
			this.db.get('SELECT * FROM progress WHERE id = 1', (err, row: any) => {
				const duration = Date.now() - startTime;
				if (err) {
					logger.error('Failed to get progress', err, undefined, { operationType: 'database_read', operationStatus: 'failure', duration });
					logger.recordDatabaseEvent('read', 'progress', duration, false, err.message);
					reject(err);
				} else {
					logger.recordDatabaseEvent('read', 'progress', duration, true);
					resolve(row as Progress);
				}
			});
		});
	}

	async updateProgress(updates: Partial<Progress>): Promise<void> {
		const startTime = Date.now();
		const fields = Object.keys(updates);
		const values = Object.values(updates);
		const setClause = fields.map((field) => `${field} = ?`).join(', ');
		return new Promise((resolve, reject) => {
			this.db.run(`UPDATE progress SET ${setClause} WHERE id = 1`, values, function (err) {
				const duration = Date.now() - startTime;
				if (err) {
					logger.error('Failed to update progress', err, undefined, { operationType: 'database_update', operationStatus: 'failure', duration });
					logger.recordDatabaseEvent('update', 'progress', duration, false, err.message);
					reject(err);
				} else {
					logger.recordDatabaseEvent('update', 'progress', duration, true);
					resolve();
				}
			});
		});
	}
}
