import sqlite3 from 'sqlite3';
import { logger } from '../../../observability/logging/logger';

export interface AttendanceAnnouncementMessage {
	sessionId: string;
	channelId: string;
	messageId: string;
	updatedAt: string;
}

export class AttendanceAnnouncementMessageRepository {
	constructor(private db: sqlite3.Database) {}

	async getMessageBySessionId(sessionId: string): Promise<AttendanceAnnouncementMessage | null> {
		const startTime = Date.now();

		return new Promise((resolve, reject) => {
			this.db.get(
				`SELECT * FROM attendance_announcement_messages WHERE sessionId = ?`,
				[sessionId],
				(err, row: AttendanceAnnouncementMessage | undefined) => {
					const duration = Date.now() - startTime;
					if (err) {
						logger.error('Failed to get attendance announcement message', err, undefined, {
							operationType: 'database_read',
							operationStatus: 'failure',
							duration,
						});
						logger.recordDatabaseEvent('read', 'attendance_announcement_messages', duration, false, err.message);
						reject(err);
					} else {
						logger.recordDatabaseEvent('read', 'attendance_announcement_messages', duration, true);
						resolve(row ?? null);
					}
				}
			);
		});
	}

	async upsertMessage(sessionId: string, channelId: string, messageId: string, updatedAt: string = new Date().toISOString()): Promise<void> {
		const startTime = Date.now();

		return new Promise((resolve, reject) => {
			this.db.run(
				`
					INSERT INTO attendance_announcement_messages (sessionId, channelId, messageId, updatedAt)
					VALUES (?, ?, ?, ?)
					ON CONFLICT(sessionId)
					DO UPDATE SET channelId = excluded.channelId, messageId = excluded.messageId, updatedAt = excluded.updatedAt
				`,
				[sessionId, channelId, messageId, updatedAt],
				function (err) {
					const duration = Date.now() - startTime;
					if (err) {
						logger.error('Failed to upsert attendance announcement message', err, undefined, {
							operationType: 'database_upsert',
							operationStatus: 'failure',
							duration,
						});
						logger.recordDatabaseEvent('upsert', 'attendance_announcement_messages', duration, false, err.message);
						reject(err);
					} else {
						logger.recordDatabaseEvent('upsert', 'attendance_announcement_messages', duration, true);
						resolve();
					}
				}
			);
		});
	}
}
