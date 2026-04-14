import sqlite3 from 'sqlite3';
import { logger } from '../../logging/logger';

export interface Attendance {
	id: number;
	sessionId: string;
	userId: string;
	status: string;
	updatedAt: string;
}

export class AttendanceRepository {
	constructor(private db: sqlite3.Database) {}

	async upsertAttendance(sessionId: string, userId: string, status: string): Promise<void> {
		const startTime = Date.now();
		const updatedAt = new Date().toISOString();

		return new Promise((resolve, reject) => {
			this.db.run(
				`
					INSERT INTO attendance (sessionId, userId, status, updatedAt)
					VALUES (?, ?, ?, ?)
					ON CONFLICT(sessionId, userId)
					DO UPDATE SET status = excluded.status, updatedAt = excluded.updatedAt
				`,
				[sessionId, userId, status, updatedAt],
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
}
