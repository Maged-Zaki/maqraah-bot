import sqlite3 from 'sqlite3';
import { ConfigurationRepository } from './repositories/ConfigurationRepository';
import { ProgressRepository } from './repositories/ProgressRepository';
import { NotesRepository } from './repositories/NotesRepository';
import { AttendanceRepository } from './repositories/AttendanceRepository';
import { ReminderEventsRepository } from './repositories/ReminderEventsRepository';
import { ScheduleRepository } from './repositories/ScheduleRepository';
import { ReminderCategoryRoleRepository } from './repositories/ReminderCategoryRoleRepository';
import { ReminderSettingsRepository, subscriptionReminderSettingsDefaults } from './repositories/ReminderSettingsRepository';
import { HijriCalendarCacheRepository } from './repositories/HijriCalendarCacheRepository';
import { SubscriptionReminderEventsRepository } from './repositories/SubscriptionReminderEventsRepository';
import { logger } from '../../observability/logging/logger';

if (!process.env.DATABASE_PATH) {
	logger.fatal('DATABASE_PATH is not defined in environment variables');
	throw new Error('DATABASE_PATH is not defined in environment variables.');
}

const db = new sqlite3.Database(process.env.DATABASE_PATH);

logger.info('Initializing database', undefined, { additionalData: { databasePath: process.env.DATABASE_PATH } });

db.serialize(() => {
	// Create new tables
	db.run(
		`
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
	 `,
		(err) => {
			if (err) {
				logger.error('Failed to create configuration table', err);
			}
		}
	);

	db.run(`INSERT OR IGNORE INTO configuration (id) VALUES (1)`, (err) => {
		if (err) {
			logger.error('Failed to insert default configuration', err);
		}
	});

	addColumnIfMissing('configuration', 'welcomeSentAt TEXT');
	
	db.run(
		`
	   CREATE TABLE IF NOT EXISTS progress (
	     id INTEGER PRIMARY KEY DEFAULT 1,
	     currentPage INTEGER DEFAULT 1,
	     currentHadith INTEGER DEFAULT 1
	   )
	 `,
		(err) => {
			if (err) {
				logger.error('Failed to create progress table', err);
			}
		}
	);

	db.run(`INSERT OR IGNORE INTO progress (id) VALUES (1)`, (err) => {
		if (err) {
			logger.error('Failed to insert default progress', err);
		}
	});

	renameColumnIfPresent('progress', 'lastPage', 'currentPage', () => {
		db.run(
			`
				UPDATE progress
				SET currentPage = CASE
					WHEN currentPage <= 0 THEN 1
					WHEN currentPage >= 604 THEN 1
					ELSE currentPage + 1
				END
			`,
			(err) => {
				if (err) {
					logger.error('Failed to migrate legacy lastPage values to currentPage', err);
				}
			}
		);
	});
	dropColumnIfPresent('progress', 'khatmahCycleCount');
	renameColumnIfPresent('progress', 'lastHadith', 'currentHadith', () => {
		db.run(
			`
				UPDATE progress
				SET currentHadith = CASE
					WHEN currentHadith <= 0 THEN 1
					ELSE currentHadith + 1
				END
			`,
			(err) => {
				if (err) {
					logger.error('Failed to migrate legacy lastHadith values to currentHadith', err);
				}
			}
		);
	});

	dropTableIfExists('quran_progress_history');

	db.run(
		`
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
	 `,
		(err) => {
			if (err) {
				logger.error('Failed to create notes table', err);
			}
		}
	);

	addColumnIfMissing('notes', 'isAnonymous INTEGER DEFAULT 0');
	addColumnIfMissing('notes', 'lastIncludedSessionId TEXT');

	db.run(
		`
	   CREATE TABLE IF NOT EXISTS attendance (
	     id INTEGER PRIMARY KEY AUTOINCREMENT,
	     sessionId TEXT NOT NULL,
	     userId TEXT NOT NULL,
	     status TEXT NOT NULL,
	     updatedAt TEXT NOT NULL,
	     announcedAt TEXT,
	     UNIQUE(sessionId, userId)
	   )
	 `,
		(err) => {
			if (err) {
				logger.error('Failed to create attendance table', err);
			}
		}
	);

	addColumnIfMissing('attendance', 'announcedAt TEXT');

	db.run(
		`
	   CREATE TABLE IF NOT EXISTS reminder_events (
	     id INTEGER PRIMARY KEY AUTOINCREMENT,
	     sessionId TEXT NOT NULL,
	     stage TEXT NOT NULL,
	     scheduledFor TEXT NOT NULL,
	     sentAt TEXT NOT NULL,
	     UNIQUE(sessionId, stage)
	   )
	 `,
		(err) => {
			if (err) {
				logger.error('Failed to create reminder_events table', err);
			}
		}
	);

	db.run(
		`
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
	 `,
		(err) => {
			if (err) {
				logger.error('Failed to create schedules table', err);
			}
		}
	);

	addColumnIfMissing('schedules', "mentionUserIds TEXT NOT NULL DEFAULT ''");

	db.run(`CREATE INDEX IF NOT EXISTS idx_schedules_status ON schedules(status)`, (err) => {
		if (err) {
			logger.error('Failed to create schedules status index', err);
		}
	});

	db.run(
		`
	   CREATE TABLE IF NOT EXISTS reminder_category_roles (
	     categoryKey TEXT PRIMARY KEY,
	     roleId TEXT NOT NULL,
	     roleName TEXT NOT NULL,
	     createdAt TEXT NOT NULL,
	     updatedAt TEXT NOT NULL
	   )
	 `,
		(err) => {
			if (err) {
				logger.error('Failed to create reminder_category_roles table', err);
			}
		}
	);

	db.run(
		`
	   CREATE TABLE IF NOT EXISTS reminder_settings (
	     id INTEGER PRIMARY KEY DEFAULT 1,
	     channelId TEXT NOT NULL DEFAULT '',
	     daysBefore INTEGER NOT NULL DEFAULT ${subscriptionReminderSettingsDefaults.daysBefore},
	     sendTime TEXT NOT NULL DEFAULT '${subscriptionReminderSettingsDefaults.sendTime}',
	     sendTimeMode TEXT NOT NULL DEFAULT '${subscriptionReminderSettingsDefaults.sendTimeMode}',
	     sendPrayer TEXT,
	     updatedAt TEXT NOT NULL
	   )
	 `,
		(err) => {
			if (err) {
				logger.error('Failed to create reminder_settings table', err);
			}
		}
	);

	addColumnIfMissing('reminder_settings', `sendTimeMode TEXT NOT NULL DEFAULT '${subscriptionReminderSettingsDefaults.sendTimeMode}'`);
	addColumnIfMissing('reminder_settings', 'sendPrayer TEXT');

	db.run(
		`INSERT OR IGNORE INTO reminder_settings (id, channelId, daysBefore, sendTime, sendTimeMode, sendPrayer, updatedAt) VALUES (1, ?, ?, ?, ?, ?, ?)`,
		[
			process.env.CHANNEL_ID ?? '',
			subscriptionReminderSettingsDefaults.daysBefore,
			subscriptionReminderSettingsDefaults.sendTime,
			subscriptionReminderSettingsDefaults.sendTimeMode,
			subscriptionReminderSettingsDefaults.sendPrayer,
			new Date().toISOString(),
		],
		(err) => {
			if (err) {
				logger.error('Failed to insert default reminder_settings row', err);
			}
		}
	);

	db.run(
		`
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
	 `,
		(err) => {
			if (err) {
				logger.error('Failed to create hijri_calendar_cache table', err);
			}
		}
	);

	db.run(
		`
	   CREATE TABLE IF NOT EXISTS subscription_reminder_events (
	     eventKey TEXT PRIMARY KEY,
	     categoryKey TEXT NOT NULL,
	     targetRoleId TEXT NOT NULL,
	     scheduledFor TEXT NOT NULL,
	     sentAt TEXT NOT NULL
	   )
	 `,
		(err) => {
			if (err) {
				logger.error('Failed to create subscription_reminder_events table', err);
			}
		}
	);
});

// Handle database errors
db.on('error', (err) => {
	logger.error('Database error occurred', err);
});

logger.info('Database initialization completed');

// Create repository instances
export const configurationRepository = new ConfigurationRepository(db);
export const progressRepository = new ProgressRepository(db);
export const notesRepository: NotesRepository = new NotesRepository(db);
export const attendanceRepository = new AttendanceRepository(db);
export const reminderEventsRepository = new ReminderEventsRepository(db);
export const scheduleRepository = new ScheduleRepository(db);
export const reminderCategoryRoleRepository = new ReminderCategoryRoleRepository(db);
export const reminderSettingsRepository = new ReminderSettingsRepository(db);
export const hijriCalendarCacheRepository = new HijriCalendarCacheRepository(db);
export const subscriptionReminderEventsRepository = new SubscriptionReminderEventsRepository(db);

function addColumnIfMissing(tableName: string, columnDefinition: string): void {
	db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition}`, (err) => {
		if (err && !err.message.includes('duplicate column name')) {
			logger.error(`Failed to add ${columnDefinition} to ${tableName}`, err);
		}
	});
}

function dropColumnIfPresent(tableName: string, columnName: string): void {
	db.run(`ALTER TABLE ${tableName} DROP COLUMN ${columnName}`, (err) => {
		if (err && !err.message.includes('no such column')) {
			logger.error(`Failed to drop ${columnName} from ${tableName}`, err);
		}
	});
}

function dropTableIfExists(tableName: string): void {
	db.run(`DROP TABLE IF EXISTS ${tableName}`, (err) => {
		if (err) {
			logger.error(`Failed to drop ${tableName}`, err);
		}
	});
}

function renameColumnIfPresent(tableName: string, sourceColumn: string, targetColumn: string, onRenamed?: () => void): void {
	db.run(`ALTER TABLE ${tableName} RENAME COLUMN ${sourceColumn} TO ${targetColumn}`, (err) => {
		if (err) {
			if (!err.message.includes('no such column') && !err.message.includes('duplicate column name')) {
				logger.error(`Failed to rename ${sourceColumn} to ${targetColumn} on ${tableName}`, err);
			}
			return;
		}

		onRenamed?.();
	});
}
