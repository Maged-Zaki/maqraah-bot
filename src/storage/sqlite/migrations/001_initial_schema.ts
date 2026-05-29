import sqlite3 from 'sqlite3';
import type { Migration } from './types';

export const migration001: Migration = {
	name: '001_initial_schema',

	async up(db: sqlite3.Database): Promise<void> {
		await run(db, `
			CREATE TABLE IF NOT EXISTS configuration (
				id INTEGER PRIMARY KEY DEFAULT 1,
				roleId TEXT DEFAULT 'Not set',
				dailyTime TEXT DEFAULT '12:00 PM',
				timezone TEXT DEFAULT 'Africa/Cairo',
				voiceChannelId TEXT DEFAULT '',
				preReminderEnabled INTEGER DEFAULT 1,
				preReminderOffsetMinutes INTEGER DEFAULT 5,
				mainReminderEnabled INTEGER DEFAULT 1,
				maqraahTimeSyncEnabled INTEGER DEFAULT 0,
				maqraahTimeSyncOffsetMinutes INTEGER DEFAULT 40,
				maqraahTimeSyncLatitude REAL DEFAULT 30.0444,
				maqraahTimeSyncLongitude REAL DEFAULT 31.2357,
				maqraahTimeSyncCalculationMethod INTEGER DEFAULT 5,
				welcomeSentAt TEXT
			)
		`);
		await run(db, `INSERT OR IGNORE INTO configuration (id) VALUES (1)`);

		await run(db, `
			CREATE TABLE IF NOT EXISTS progress (
				id INTEGER PRIMARY KEY DEFAULT 1,
				currentPage INTEGER DEFAULT 1,
				currentHadith INTEGER DEFAULT 1
			)
		`);
		await run(db, `INSERT OR IGNORE INTO progress (id) VALUES (1)`);

		await run(db, `
			CREATE TABLE IF NOT EXISTS notes (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				userId TEXT NOT NULL,
				note TEXT NOT NULL,
				dateAdded TEXT NOT NULL,
				status TEXT DEFAULT 'pending',
				lastIncludedDate TEXT,
				lastIncludedSessionId TEXT,
				isAnonymous INTEGER DEFAULT 0
			)
		`);

		await run(db, `
			CREATE TABLE IF NOT EXISTS attendance (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				sessionId TEXT NOT NULL,
				userId TEXT NOT NULL,
				status TEXT NOT NULL,
				updatedAt TEXT NOT NULL,
				announcedAt TEXT,
				UNIQUE(sessionId, userId)
			)
		`);

		await run(db, `
			CREATE TABLE IF NOT EXISTS reminder_events (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				sessionId TEXT NOT NULL,
				stage TEXT NOT NULL,
				scheduledFor TEXT NOT NULL,
				sentAt TEXT NOT NULL,
				UNIQUE(sessionId, stage)
			)
		`);

		await run(db, `
			CREATE TABLE IF NOT EXISTS attendance_announcement_messages (
				sessionId TEXT PRIMARY KEY,
				channelId TEXT NOT NULL,
				messageId TEXT NOT NULL,
				updatedAt TEXT NOT NULL
			)
		`);

		await run(db, `
			CREATE TABLE IF NOT EXISTS schedules (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL,
				nameKey TEXT NOT NULL UNIQUE,
				type TEXT NOT NULL,
				weekdays TEXT,
				oneTimeDate TEXT,
				time TEXT NOT NULL,
				message TEXT NOT NULL,
				mentionUserIds TEXT NOT NULL DEFAULT '',
				status TEXT DEFAULT 'active',
				creatorUserId TEXT NOT NULL,
				createdAt TEXT NOT NULL,
				updatedAt TEXT NOT NULL,
				lastRunAt TEXT
			)
		`);
		await run(db, `CREATE INDEX IF NOT EXISTS idx_schedules_status ON schedules(status)`);

		await run(db, `
			CREATE TABLE IF NOT EXISTS reminder_category_roles (
				categoryKey TEXT PRIMARY KEY,
				roleId TEXT NOT NULL,
				roleName TEXT NOT NULL,
				createdAt TEXT NOT NULL,
				updatedAt TEXT NOT NULL
			)
		`);

		await run(db, `
			CREATE TABLE IF NOT EXISTS reminder_settings (
				id INTEGER PRIMARY KEY DEFAULT 1,
				channelId TEXT NOT NULL DEFAULT '',
				daysBefore INTEGER NOT NULL DEFAULT 1,
				sendTime TEXT NOT NULL DEFAULT '6:00 PM',
				sendTimeMode TEXT NOT NULL DEFAULT 'fixed',
				sendPrayer TEXT,
				updatedAt TEXT NOT NULL
			)
		`);
		await run(
			db,
			`INSERT OR IGNORE INTO reminder_settings (id, channelId, daysBefore, sendTime, sendTimeMode, sendPrayer, updatedAt) VALUES (1, ?, 1, '6:00 PM', 'fixed', NULL, ?)`,
			[process.env.CHANNEL_ID ?? '', new Date().toISOString()],
		);

		await run(db, `
			CREATE TABLE IF NOT EXISTS hijri_calendar_cache (
				gregorianDate TEXT PRIMARY KEY,
				hijriYear INTEGER NOT NULL,
				hijriMonth INTEGER NOT NULL,
				hijriDay INTEGER NOT NULL,
				hijriMonthNameAr TEXT NOT NULL,
				hijriMonthNameEn TEXT NOT NULL,
				provider TEXT NOT NULL,
				fetchedAt TEXT NOT NULL
			)
		`);

		await run(db, `
			CREATE TABLE IF NOT EXISTS subscription_reminder_events (
				eventKey TEXT PRIMARY KEY,
				categoryKey TEXT NOT NULL,
				targetRoleId TEXT NOT NULL,
				scheduledFor TEXT NOT NULL,
				sentAt TEXT NOT NULL
			)
		`);
	},
};

function run(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<void> {
	return new Promise((resolve, reject) => {
		db.run(sql, params, (err) => {
			if (err) {
				reject(err);
			} else {
				resolve();
			}
		});
	});
}
