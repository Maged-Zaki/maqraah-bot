import sqlite3 from 'sqlite3';
import { logger } from '../../../observability/logging/logger';

export interface ReminderCategoryRole {
	categoryKey: string;
	roleId: string;
	roleName: string;
	createdAt: string;
	updatedAt: string;
}

export interface UpsertReminderCategoryRoleInput {
	categoryKey: string;
	roleId: string;
	roleName: string;
}

export class ReminderCategoryRoleRepository {
	constructor(private db: sqlite3.Database) {}

	async getByCategoryKey(categoryKey: string): Promise<ReminderCategoryRole | null> {
		const startTime = Date.now();

		return new Promise((resolve, reject) => {
			this.db.get(
				`SELECT * FROM reminder_category_roles WHERE categoryKey = ?`,
				[categoryKey],
				(err, row: ReminderCategoryRole | undefined) => {
					const duration = Date.now() - startTime;
					if (err) {
						logger.error('Failed to get reminder category role', err, undefined, {
							operationType: 'database_read',
							operationStatus: 'failure',
							duration,
						});
						logger.recordDatabaseEvent('read', 'reminder_category_roles', duration, false, err.message);
						reject(err);
					} else {
						logger.recordDatabaseEvent('read', 'reminder_category_roles', duration, true);
						resolve(row ?? null);
					}
				}
			);
		});
	}

	async getAll(): Promise<ReminderCategoryRole[]> {
		const startTime = Date.now();

		return new Promise((resolve, reject) => {
			this.db.all(`SELECT * FROM reminder_category_roles ORDER BY categoryKey ASC`, (err, rows: ReminderCategoryRole[]) => {
				const duration = Date.now() - startTime;
				if (err) {
					logger.error('Failed to get reminder category roles', err, undefined, {
						operationType: 'database_read',
						operationStatus: 'failure',
						duration,
					});
					logger.recordDatabaseEvent('read', 'reminder_category_roles', duration, false, err.message);
					reject(err);
				} else {
					logger.recordDatabaseEvent('read', 'reminder_category_roles', duration, true);
					resolve(rows);
				}
			});
		});
	}

	async upsert(input: UpsertReminderCategoryRoleInput): Promise<ReminderCategoryRole> {
		const startTime = Date.now();
		const now = new Date().toISOString();

		await new Promise<void>((resolve, reject) => {
			this.db.run(
				`
					INSERT INTO reminder_category_roles (categoryKey, roleId, roleName, createdAt, updatedAt)
					VALUES (?, ?, ?, ?, ?)
					ON CONFLICT(categoryKey) DO UPDATE SET
						roleId = excluded.roleId,
						roleName = excluded.roleName,
						updatedAt = excluded.updatedAt
				`,
				[input.categoryKey, input.roleId, input.roleName, now, now],
				(err) => {
					const duration = Date.now() - startTime;
					if (err) {
						logger.error('Failed to upsert reminder category role', err, undefined, {
							operationType: 'database_upsert',
							operationStatus: 'failure',
							duration,
						});
						logger.recordDatabaseEvent('upsert', 'reminder_category_roles', duration, false, err.message);
						reject(err);
					} else {
						logger.recordDatabaseEvent('upsert', 'reminder_category_roles', duration, true);
						resolve();
					}
				}
			);
		});

		const role = await this.getByCategoryKey(input.categoryKey);
		if (!role) {
			throw new Error('Reminder category role was not found after upsert.');
		}

		return role;
	}
}
