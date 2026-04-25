import sqlite3 from 'sqlite3';
import { logger } from '../../../observability/logging/logger';

export interface SubscriptionReminderEvent {
	eventKey: string;
	categoryKey: string;
	targetRoleId: string;
	scheduledFor: string;
	sentAt: string;
}

export class SubscriptionReminderEventsRepository {
	constructor(private db: sqlite3.Database) {}

	async hasEvent(eventKey: string): Promise<boolean> {
		const startTime = Date.now();

		return new Promise((resolve, reject) => {
			this.db.get(
				`SELECT eventKey FROM subscription_reminder_events WHERE eventKey = ?`,
				[eventKey],
				(err, row: Pick<SubscriptionReminderEvent, 'eventKey'> | undefined) => {
					const duration = Date.now() - startTime;
					if (err) {
						logger.error('Failed to check subscription reminder event', err, undefined, {
							operationType: 'database_read',
							operationStatus: 'failure',
							duration,
						});
						logger.recordDatabaseEvent('read', 'subscription_reminder_events', duration, false, err.message);
						reject(err);
					} else {
						logger.recordDatabaseEvent('read', 'subscription_reminder_events', duration, true);
						resolve(Boolean(row));
					}
				}
			);
		});
	}

	async recordEventSent(input: SubscriptionReminderEvent): Promise<boolean> {
		const startTime = Date.now();

		return new Promise((resolve, reject) => {
			this.db.run(
				`
					INSERT OR IGNORE INTO subscription_reminder_events (
						eventKey,
						categoryKey,
						targetRoleId,
						scheduledFor,
						sentAt
					)
					VALUES (?, ?, ?, ?, ?)
				`,
				[input.eventKey, input.categoryKey, input.targetRoleId, input.scheduledFor, input.sentAt],
				function (this: sqlite3.RunResult, err) {
					const duration = Date.now() - startTime;
					if (err) {
						logger.error('Failed to record subscription reminder event', err, undefined, {
							operationType: 'database_create',
							operationStatus: 'failure',
							duration,
						});
						logger.recordDatabaseEvent('create', 'subscription_reminder_events', duration, false, err.message);
						reject(err);
					} else {
						logger.recordDatabaseEvent('create', 'subscription_reminder_events', duration, true);
						resolve(this.changes > 0);
					}
				}
			);
		});
	}
}
