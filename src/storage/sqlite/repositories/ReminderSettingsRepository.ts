import sqlite3 from 'sqlite3';
import { logger } from '../../../observability/logging/logger';
import { normalizePrayerName, type PrayerName } from '../../../shared/prayers';

export const reminderSendTimeModes = {
	FIXED: 'fixed',
	PRAYER: 'prayer',
} as const;

export type ReminderSendTimeMode = (typeof reminderSendTimeModes)[keyof typeof reminderSendTimeModes];

export interface ReminderSettings {
	id: number;
	channelId: string;
	daysBefore: number;
	sendTime: string;
	sendTimeMode: ReminderSendTimeMode;
	sendPrayer: PrayerName | null;
	updatedAt: string;
}

export interface UpdateReminderSettingsInput {
	channelId?: string;
	daysBefore?: number;
	sendTime?: string;
	sendTimeMode?: ReminderSendTimeMode;
	sendPrayer?: PrayerName | null;
}

export const subscriptionReminderSettingsDefaults = {
	daysBefore: 1,
	sendTime: '6:00 PM',
	sendTimeMode: reminderSendTimeModes.FIXED,
	sendPrayer: null,
} as const;

export class ReminderSettingsRepository {
	constructor(private db: sqlite3.Database) {}

	async getSettings(defaultChannelId: string = process.env.CHANNEL_ID ?? ''): Promise<ReminderSettings> {
		await this.ensureSettingsRow(defaultChannelId);

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
			const sendPrayer = normalizePrayerName(row.sendPrayer);
			const sendTimeMode = normalizeSendTimeMode(row.sendTimeMode, sendPrayer);

			return {
				...row,
				channelId: row.channelId || defaultChannelId,
				daysBefore: normalizeDaysBefore(row.daysBefore),
				sendTime: row.sendTime || subscriptionReminderSettingsDefaults.sendTime,
				sendTimeMode,
				sendPrayer: sendTimeMode === reminderSendTimeModes.PRAYER ? sendPrayer : null,
			};
		}

		throw new Error('Reminder settings row was not initialized.');
	}

	async updateSettings(updates: UpdateReminderSettingsInput): Promise<ReminderSettings> {
		await this.ensureSettingsRow();

		const fields = (Object.keys(updates) as (keyof UpdateReminderSettingsInput)[]).filter((field) => updates[field] !== undefined);
		if (fields.length === 0) {
			return this.getSettings();
		}

		const now = new Date().toISOString();
		const startTime = Date.now();
		const values = fields.map((field) => updates[field] ?? null);
		values.push(now);
		const setClause = fields.map((field) => `${field} = ?`).join(', ');

		await new Promise<void>((resolve, reject) => {
			this.db.run(
				`UPDATE reminder_settings SET ${setClause}, updatedAt = ? WHERE id = 1`,
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

	private async ensureSettingsRow(defaultChannelId: string = process.env.CHANNEL_ID ?? ''): Promise<void> {
		const now = new Date().toISOString();

		await new Promise<void>((resolve, reject) => {
			this.db.run(
				`
					INSERT OR IGNORE INTO reminder_settings (id, channelId, daysBefore, sendTime, sendTimeMode, sendPrayer, updatedAt)
					VALUES (?, ?, ?, ?, ?, ?, ?)
				`,
				[
					1,
					defaultChannelId,
					subscriptionReminderSettingsDefaults.daysBefore,
					subscriptionReminderSettingsDefaults.sendTime,
					subscriptionReminderSettingsDefaults.sendTimeMode,
					subscriptionReminderSettingsDefaults.sendPrayer,
					now,
				],
				(err) => {
					if (err) {
						reject(err);
					} else {
						resolve();
					}
				}
			);
		});
	}
}

function normalizeDaysBefore(value: number): number {
	if (!Number.isInteger(value) || value < 0) {
		return subscriptionReminderSettingsDefaults.daysBefore;
	}

	return value;
}

function normalizeSendTimeMode(value: string | null | undefined, sendPrayer: PrayerName | null): ReminderSendTimeMode {
	if (value === reminderSendTimeModes.PRAYER && sendPrayer) {
		return reminderSendTimeModes.PRAYER;
	}

	return reminderSendTimeModes.FIXED;
}
