import sqlite3 from 'sqlite3';
import { logger } from '../../../observability/logging/logger';

export interface ReminderSettings {
	id: number;
	channelId: string;
	daysBefore: number;
	sendTime: string;
	updatedAt: string;
}

export interface UpdateReminderSettingsInput {
	channelId?: string;
	daysBefore?: number;
	sendTime?: string;
}

export const subscriptionReminderSettingsDefaults = {
	daysBefore: 1,
	sendTime: '6:00 PM',
} as const;

export class ReminderSettingsRepository {
	constructor(private db: sqlite3.Database) {}

	async getSettings(defaultChannelId: string = process.env.CHANNEL_ID ?? ''): Promise<ReminderSettings> {
		const startTime = Date.now();

		const row = await new Promise<ReminderSettings | undefined>((resolve, reject) => {
			this.db.get(`SELECT * FROM reminder_settings WHERE id = 1`, (err, result: ReminderSettings | undefined) => {
				const duration = Date.now() - startTime;
				if (err) {
					logger.error('Failed to get reminder settings', err, undefined, {
						operationType: 'database_read',
						operationStatus: 'failure',
						duration,
					});
					logger.recordDatabaseEvent('read', 'reminder_settings', duration, false, err.message);
					reject(err);
				} else {
					logger.recordDatabaseEvent('read', 'reminder_settings', duration, true);
					resolve(result);
				}
			});
		});

		if (row) {
			return {
				...row,
				channelId: row.channelId || defaultChannelId,
				daysBefore: normalizeDaysBefore(row.daysBefore),
				sendTime: row.sendTime || subscriptionReminderSettingsDefaults.sendTime,
			};
		}

		const now = new Date().toISOString();
		const settings: ReminderSettings = {
			id: 1,
			channelId: defaultChannelId,
			daysBefore: subscriptionReminderSettingsDefaults.daysBefore,
			sendTime: subscriptionReminderSettingsDefaults.sendTime,
			updatedAt: now,
		};

		await this.updateSettings({
			channelId: settings.channelId,
			daysBefore: settings.daysBefore,
			sendTime: settings.sendTime,
		});

		return settings;
	}

	async updateSettings(updates: UpdateReminderSettingsInput): Promise<ReminderSettings> {
		const fields = Object.keys(updates) as (keyof UpdateReminderSettingsInput)[];
		if (fields.length === 0) {
			return this.getSettings();
		}

		const now = new Date().toISOString();
		const startTime = Date.now();
		const values = [
			updates.channelId ?? null,
			updates.daysBefore ?? null,
			updates.sendTime ?? null,
			now,
			updates.channelId ?? null,
			updates.daysBefore ?? null,
			updates.sendTime ?? null,
			now,
		];

		await new Promise<void>((resolve, reject) => {
			this.db.run(
				`
					INSERT INTO reminder_settings (id, channelId, daysBefore, sendTime, updatedAt)
					VALUES (
						1,
						COALESCE(?, ''),
						COALESCE(?, ${subscriptionReminderSettingsDefaults.daysBefore}),
						COALESCE(?, '${subscriptionReminderSettingsDefaults.sendTime}'),
						?
					)
					ON CONFLICT(id) DO UPDATE SET
						channelId = COALESCE(?, reminder_settings.channelId),
						daysBefore = COALESCE(?, reminder_settings.daysBefore),
						sendTime = COALESCE(?, reminder_settings.sendTime),
						updatedAt = ?
				`,
				values,
				(err) => {
					const duration = Date.now() - startTime;
					if (err) {
						logger.error('Failed to update reminder settings', err, undefined, {
							operationType: 'database_update',
							operationStatus: 'failure',
							duration,
						});
						logger.recordDatabaseEvent('update', 'reminder_settings', duration, false, err.message);
						reject(err);
					} else {
						logger.recordDatabaseEvent('update', 'reminder_settings', duration, true);
						resolve();
					}
				}
			);
		});

		return this.getSettings();
	}
}

function normalizeDaysBefore(value: number): number {
	if (!Number.isInteger(value) || value < 0) {
		return subscriptionReminderSettingsDefaults.daysBefore;
	}

	return value;
}
