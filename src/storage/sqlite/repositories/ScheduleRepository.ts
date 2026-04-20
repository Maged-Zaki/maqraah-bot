import sqlite3 from 'sqlite3';
import { logger } from '../../../observability/logging/logger';

export const scheduleTypes = {
	RECURRING: 'recurring',
	ONE_TIME: 'one_time',
} as const;

export type ScheduleType = (typeof scheduleTypes)[keyof typeof scheduleTypes];

export const scheduleStatuses = {
	ACTIVE: 'active',
	COMPLETED: 'completed',
} as const;

export type ScheduleStatus = (typeof scheduleStatuses)[keyof typeof scheduleStatuses];

export interface Schedule {
	id: number;
	name: string;
	nameKey: string;
	type: ScheduleType;
	weekdays: string | null;
	oneTimeDate: string | null;
	time: string;
	message: string;
	mentionUserIds: string;
	status: ScheduleStatus;
	creatorUserId: string;
	createdAt: string;
	updatedAt: string;
	lastRunAt: string | null;
}

export interface CreateScheduleInput {
	name: string;
	type: ScheduleType;
	weekdays?: string | null;
	oneTimeDate?: string | null;
	time: string;
	message: string;
	mentionUserIds: string;
	creatorUserId: string;
}

export interface UpdateScheduleInput {
	name?: string;
	weekdays?: string | null;
	oneTimeDate?: string | null;
	time?: string;
	message?: string;
	mentionUserIds?: string;
	status?: ScheduleStatus;
}

export class ScheduleRepository {
	constructor(private db: sqlite3.Database) {}

	async createSchedule(input: CreateScheduleInput): Promise<Schedule> {
		const startTime = Date.now();
		const now = new Date().toISOString();
		const name = normalizeScheduleName(input.name);
		const nameKey = toScheduleNameKey(name);

		const id = await new Promise<number>((resolve, reject) => {
			this.db.run(
				`
					INSERT INTO schedules (
						name,
						nameKey,
						type,
						weekdays,
						oneTimeDate,
						time,
						message,
						mentionUserIds,
						status,
						creatorUserId,
						createdAt,
						updatedAt
					)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				`,
				[
					name,
					nameKey,
					input.type,
					input.weekdays ?? null,
					input.oneTimeDate ?? null,
					input.time,
					input.message,
					input.mentionUserIds,
					scheduleStatuses.ACTIVE,
					input.creatorUserId,
					now,
					now,
				],
				function (this: sqlite3.RunResult, err) {
					const duration = Date.now() - startTime;
					if (err) {
						logger.error('Failed to create schedule', err, undefined, {
							operationType: 'database_create',
							operationStatus: 'failure',
							duration,
						});
						logger.recordDatabaseEvent('create', 'schedules', duration, false, err.message);
						reject(err);
						return;
					}

					logger.recordDatabaseEvent('create', 'schedules', duration, true);
					resolve(this.lastID);
				}
			);
		});

		return requireSchedule(await this.getScheduleById(id));
	}

	async getScheduleById(id: number): Promise<Schedule | null> {
		const startTime = Date.now();

		return new Promise((resolve, reject) => {
			this.db.get(`SELECT * FROM schedules WHERE id = ?`, [id], (err, row: Schedule | undefined) => {
				const duration = Date.now() - startTime;
				if (err) {
					logger.error('Failed to get schedule by ID', err, undefined, {
						operationType: 'database_read',
						operationStatus: 'failure',
						duration,
					});
					logger.recordDatabaseEvent('read', 'schedules', duration, false, err.message);
					reject(err);
				} else {
					logger.recordDatabaseEvent('read', 'schedules', duration, true);
					resolve(row ?? null);
				}
			});
		});
	}

	async getScheduleByName(name: string): Promise<Schedule | null> {
		const startTime = Date.now();
		const nameKey = toScheduleNameKey(name);

		return new Promise((resolve, reject) => {
			this.db.get(`SELECT * FROM schedules WHERE nameKey = ?`, [nameKey], (err, row: Schedule | undefined) => {
				const duration = Date.now() - startTime;
				if (err) {
					logger.error('Failed to get schedule by name', err, undefined, {
						operationType: 'database_read',
						operationStatus: 'failure',
						duration,
					});
					logger.recordDatabaseEvent('read', 'schedules', duration, false, err.message);
					reject(err);
				} else {
					logger.recordDatabaseEvent('read', 'schedules', duration, true);
					resolve(row ?? null);
				}
			});
		});
	}

	async getActiveSchedules(): Promise<Schedule[]> {
		const startTime = Date.now();

		return new Promise((resolve, reject) => {
			this.db.all(
				`SELECT * FROM schedules WHERE status = ? ORDER BY name COLLATE NOCASE ASC`,
				[scheduleStatuses.ACTIVE],
				(err, rows: Schedule[]) => {
					const duration = Date.now() - startTime;
					if (err) {
						logger.error('Failed to get active schedules', err, undefined, {
							operationType: 'database_read',
							operationStatus: 'failure',
							duration,
						});
						logger.recordDatabaseEvent('read', 'schedules', duration, false, err.message);
						reject(err);
					} else {
						logger.recordDatabaseEvent('read', 'schedules', duration, true);
						resolve(rows);
					}
				}
			);
		});
	}

	async updateScheduleById(id: number, updates: UpdateScheduleInput): Promise<Schedule | null> {
		const fields: string[] = [];
		const values: unknown[] = [];

		if (updates.name !== undefined) {
			const name = normalizeScheduleName(updates.name);
			fields.push('name = ?', 'nameKey = ?');
			values.push(name, toScheduleNameKey(name));
		}

		if (updates.weekdays !== undefined) {
			fields.push('weekdays = ?');
			values.push(updates.weekdays);
		}

		if (updates.oneTimeDate !== undefined) {
			fields.push('oneTimeDate = ?');
			values.push(updates.oneTimeDate);
		}

		if (updates.time !== undefined) {
			fields.push('time = ?');
			values.push(updates.time);
		}

		if (updates.message !== undefined) {
			fields.push('message = ?');
			values.push(updates.message);
		}

		if (updates.mentionUserIds !== undefined) {
			fields.push('mentionUserIds = ?');
			values.push(updates.mentionUserIds);
		}

		if (updates.status !== undefined) {
			fields.push('status = ?');
			values.push(updates.status);
		}

		if (fields.length === 0) {
			return this.getScheduleById(id);
		}

		fields.push('updatedAt = ?');
		values.push(new Date().toISOString(), id);
		const startTime = Date.now();

		await new Promise<void>((resolve, reject) => {
			this.db.run(`UPDATE schedules SET ${fields.join(', ')} WHERE id = ?`, values, function (err) {
				const duration = Date.now() - startTime;
				if (err) {
					logger.error('Failed to update schedule', err, undefined, {
						operationType: 'database_update',
						operationStatus: 'failure',
						duration,
					});
					logger.recordDatabaseEvent('update', 'schedules', duration, false, err.message);
					reject(err);
				} else {
					logger.recordDatabaseEvent('update', 'schedules', duration, true);
					resolve();
				}
			});
		});

		return this.getScheduleById(id);
	}

	async deleteScheduleByName(name: string): Promise<boolean> {
		const startTime = Date.now();
		const nameKey = toScheduleNameKey(name);

		return new Promise((resolve, reject) => {
			this.db.run(`DELETE FROM schedules WHERE nameKey = ?`, [nameKey], function (this: sqlite3.RunResult, err) {
				const duration = Date.now() - startTime;
				if (err) {
					logger.error('Failed to delete schedule', err, undefined, {
						operationType: 'database_delete',
						operationStatus: 'failure',
						duration,
					});
					logger.recordDatabaseEvent('delete', 'schedules', duration, false, err.message);
					reject(err);
				} else {
					logger.recordDatabaseEvent('delete', 'schedules', duration, true);
					resolve(this.changes > 0);
				}
			});
		});
	}

	async markScheduleCompleted(id: number): Promise<void> {
		await this.updateScheduleById(id, { status: scheduleStatuses.COMPLETED });
	}

	async recordScheduleRun(id: number, lastRunAt: string = new Date().toISOString()): Promise<void> {
		const startTime = Date.now();

		return new Promise((resolve, reject) => {
			this.db.run(`UPDATE schedules SET lastRunAt = ?, updatedAt = ? WHERE id = ?`, [lastRunAt, lastRunAt, id], function (err) {
				const duration = Date.now() - startTime;
				if (err) {
					logger.error('Failed to record schedule run', err, undefined, {
						operationType: 'database_update',
						operationStatus: 'failure',
						duration,
					});
					logger.recordDatabaseEvent('update', 'schedules', duration, false, err.message);
					reject(err);
				} else {
					logger.recordDatabaseEvent('update', 'schedules', duration, true);
					resolve();
				}
			});
		});
	}
}

export function normalizeScheduleName(name: string): string {
	return name.trim().replace(/\s+/g, ' ');
}

export function toScheduleNameKey(name: string): string {
	return normalizeScheduleName(name).toLowerCase();
}

function requireSchedule(schedule: Schedule | null): Schedule {
	if (!schedule) {
		throw new Error('Schedule was not found after it was created.');
	}

	return schedule;
}
