import sqlite3 from 'sqlite3';
import { logger } from '../logger';

export interface Configuration {
	roleId: string;
	dailyTime: string;
	timezone: string;
	voiceChannelId: string;
}

export class ConfigurationRepository {
	constructor(private db: sqlite3.Database) {}

	async getConfiguration(): Promise<Configuration> {
		const startTime = Date.now();
		return new Promise((resolve, reject) => {
			this.db.get('SELECT * FROM configuration WHERE id = 1', (err, row: any) => {
				const duration = Date.now() - startTime;
				if (err) {
					logger.error('Failed to get configuration', err, undefined, { operationType: 'database_read', operationStatus: 'failure', duration });
					logger.recordDatabaseEvent('read', 'configuration', duration, false, err.message);
					reject(err);
				} else {
					logger.debug('Configuration retrieved successfully', undefined, { operationType: 'database_read', operationStatus: 'success', duration });
					logger.recordDatabaseEvent('read', 'configuration', duration, true);
					resolve(row as Configuration);
				}
			});
		});
	}

	async updateConfiguration(updates: Partial<Configuration>): Promise<void> {
		const startTime = Date.now();
		const fields = Object.keys(updates);
		const values = Object.values(updates);
		const setClause = fields.map((field) => `${field} = ?`).join(', ');
		return new Promise((resolve, reject) => {
			this.db.run(`UPDATE configuration SET ${setClause} WHERE id = 1`, values, function (err) {
				const duration = Date.now() - startTime;
				if (err) {
					logger.error('Failed to update configuration', err, undefined, { operationType: 'database_update', operationStatus: 'failure', duration });
					logger.recordDatabaseEvent('update', 'configuration', duration, false, err.message);
					reject(err);
				} else {
					logger.debug('Configuration updated successfully', undefined, { operationType: 'database_update', operationStatus: 'success', duration });
					logger.recordDatabaseEvent('update', 'configuration', duration, true);
					resolve();
				}
			});
		});
	}
}
