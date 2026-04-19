import sqlite3 from 'sqlite3';
import { logger } from '../../../observability/logging/logger';

export interface Attendance {
	id: number;
	sessionId: string;
	userId: string;
	status: string;
	updatedAt: string;
	announcedAt: string | null;
}

export class AttendanceRepository {
	constructor(private db: sqlite3.Database) {}

	async upsertAttendance(sessionId: string, userId: string, status: string, announcedAt: string | null = null): Promise<void> {
		const startTime = Date.now();
		const updatedAt = new Date().toISOString();

		return new Promise((resolve, reject) => {
			this.db.run(
				`
					INSERT INTO attendance (sessionId, userId, status, updatedAt, announcedAt)
					VALUES (?, ?, ?, ?, ?)
					ON CONFLICT(sessionId, userId)
					DO UPDATE SET status = excluded.status, updatedAt = excluded.updatedAt, announcedAt = excluded.announcedAt
				`,
				[sessionId, userId, status, updatedAt, announcedAt],
				function (err) {
					const duration = Date.now() - startTime;
					if (err) {
						logger.error('Failed to upsert attendance', err, undefined, {
							operationType: 'database_upsert',
							operationStatus: 'failure',
							duration,
						});
						logger.recordDatabaseEvent('upsert', 'attendance', duration, false, err.message);
						reject(err);
					} else {
						logger.recordDatabaseEvent('upsert', 'attendance', duration, true);
						resolve();
					}
				}
			);
		});
	}

	async getAttendance(sessionId: string, userId: string): Promise<Attendance | null> {
		const startTime = Date.now();

		return new Promise((resolve, reject) => {
			this.db.get(`SELECT * FROM attendance WHERE sessionId = ? AND userId = ?`, [sessionId, userId], (err, row: Attendance | undefined) => {
				const duration = Date.now() - startTime;
				if (err) {
					logger.error('Failed to get attendance', err, undefined, {
						operationType: 'database_read',
						operationStatus: 'failure',
						duration,
					});
					logger.recordDatabaseEvent('read', 'attendance', duration, false, err.message);
					reject(err);
				} else {
					logger.recordDatabaseEvent('read', 'attendance', duration, true);
					resolve(row ?? null);
				}
			});
		});
	}

	async getAttendanceBySessionId(sessionId: string): Promise<Attendance[]> {
		const startTime = Date.now();

		return new Promise((resolve, reject) => {
			this.db.all(
				`SELECT * FROM attendance WHERE sessionId = ? ORDER BY updatedAt ASC, userId ASC`,
				[sessionId],
				(err, rows: Attendance[]) => {
					const duration = Date.now() - startTime;
					if (err) {
						logger.error('Failed to get attendance by session ID', err, undefined, {
							operationType: 'database_read',
							operationStatus: 'failure',
							duration,
						});
						logger.recordDatabaseEvent('read', 'attendance', duration, false, err.message);
						reject(err);
					} else {
						logger.recordDatabaseEvent('read', 'attendance', duration, true);
						resolve(rows);
					}
				}
			);
		});
	}

	async deleteAttendance(sessionId: string, userId: string): Promise<boolean> {
		const startTime = Date.now();

		return new Promise((resolve, reject) => {
			this.db.run(`DELETE FROM attendance WHERE sessionId = ? AND userId = ?`, [sessionId, userId], function (this: sqlite3.RunResult, err) {
				const duration = Date.now() - startTime;
				if (err) {
					logger.error('Failed to delete attendance', err, undefined, {
						operationType: 'database_delete',
						operationStatus: 'failure',
						duration,
					});
					logger.recordDatabaseEvent('delete', 'attendance', duration, false, err.message);
					reject(err);
				} else {
					logger.recordDatabaseEvent('delete', 'attendance', duration, true);
					resolve(this.changes > 0);
				}
			});
		});
	}

	async markAttendanceAnnounced(sessionId: string, userId: string, announcedAt: string = new Date().toISOString()): Promise<void> {
		const startTime = Date.now();

		return new Promise((resolve, reject) => {
			this.db.run(
				`UPDATE attendance SET announcedAt = ? WHERE sessionId = ? AND userId = ?`,
				[announcedAt, sessionId, userId],
				function (err) {
					const duration = Date.now() - startTime;
					if (err) {
						logger.error('Failed to mark attendance announced', err, undefined, {
							operationType: 'database_update',
							operationStatus: 'failure',
							duration,
						});
						logger.recordDatabaseEvent('update', 'attendance', duration, false, err.message);
						reject(err);
					} else {
						logger.recordDatabaseEvent('update', 'attendance', duration, true);
						resolve();
					}
				}
			);
		});
	}
}
