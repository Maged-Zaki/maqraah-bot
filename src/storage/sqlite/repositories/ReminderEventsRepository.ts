import sqlite3 from 'sqlite3';
import type { ReminderStage } from '../../../features/reminders/cadence';
import { logger } from '../../../observability/logging/logger';

export interface ReminderEvent {
	id: number;
	sessionId: string;
	stage: ReminderStage;
	scheduledFor: string;
	sentAt: string;
}

export class ReminderEventsRepository {
	constructor(private db: sqlite3.Database) {}

	async recordSentEventIfNew(sessionId: string, stage: ReminderStage, scheduledFor: string, sentAt: string = new Date().toISOString()): Promise<boolean> {
		const startTime = Date.now();

		return new Promise((resolve, reject) => {
			this.db.run(
				`
					INSERT OR IGNORE INTO reminder_events (sessionId, stage, scheduledFor, sentAt)
					VALUES (?, ?, ?, ?)
				`,
				[sessionId, stage, scheduledFor, sentAt],
				function (this: sqlite3.RunResult, err) {
					const duration = Date.now() - startTime;
					if (err) {
						logger.error('Failed to record reminder event', err, undefined, {
							operationType: 'database_create',
							operationStatus: 'failure',
							duration,
						});
						logger.recordDatabaseEvent('create', 'reminder_events', duration, false, err.message);
						reject(err);
					} else {
						logger.recordDatabaseEvent('create', 'reminder_events', duration, true);
						resolve(this.changes > 0);
					}
				}
			);
		});
	}
}
