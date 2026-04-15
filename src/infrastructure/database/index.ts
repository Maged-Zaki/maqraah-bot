import sqlite3 from 'sqlite3';
import { ConfigurationRepository } from './repositories/ConfigurationRepository';
import { ProgressRepository } from './repositories/ProgressRepository';
import { NotesRepository } from './repositories/NotesRepository';
import { AttendanceRepository } from './repositories/AttendanceRepository';
import { ReminderEventsRepository } from './repositories/ReminderEventsRepository';
import { logger } from '../logging/logger';

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
	     maqraahTimeSyncCalculationMethod INTEGER DEFAULT 5
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
	
	db.run(
		`
	   CREATE TABLE IF NOT EXISTS progress (
	     id INTEGER PRIMARY KEY DEFAULT 1,
	     lastPage INTEGER DEFAULT 0,
	     lastHadith INTEGER DEFAULT 0
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

	db.run(
		`
	   CREATE TABLE IF NOT EXISTS notes (
	     id INTEGER PRIMARY KEY AUTOINCREMENT,
	     userId TEXT NOT NULL,
	     note TEXT NOT NULL,
	     dateAdded TEXT NOT NULL,
	     status TEXT DEFAULT 'pending',
	     lastIncludedDate TEXT
	   )
	 `,
		(err) => {
			if (err) {
				logger.error('Failed to create notes table', err);
			}
		}
	);

	db.run(
		`
	   CREATE TABLE IF NOT EXISTS attendance (
	     id INTEGER PRIMARY KEY AUTOINCREMENT,
	     sessionId TEXT NOT NULL,
	     userId TEXT NOT NULL,
	     status TEXT NOT NULL,
	     updatedAt TEXT NOT NULL,
	     UNIQUE(sessionId, userId)
	   )
	 `,
		(err) => {
			if (err) {
				logger.error('Failed to create attendance table', err);
			}
		}
	);

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
});

// Handle database errors
db.on('error', (err) => {
	logger.error('Database error occurred', err);
});

logger.info('Database initialization completed');

// Create repository instances
export const configurationRepository = new ConfigurationRepository(db);
export const progressRepository = new ProgressRepository(db);
export const notesRepository = new NotesRepository(db);
export const attendanceRepository = new AttendanceRepository(db);
export const reminderEventsRepository = new ReminderEventsRepository(db);

function addColumnIfMissing(tableName: string, columnDefinition: string): void {
	db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition}`, (err) => {
		if (err && !err.message.includes('duplicate column name')) {
			logger.error(`Failed to add ${columnDefinition} to ${tableName}`, err);
		}
	});
}

function copyColumnIfPresent(tableName: string, sourceColumn: string, targetColumn: string): void {
	db.run(`UPDATE ${tableName} SET ${targetColumn} = ${sourceColumn} WHERE ${sourceColumn} IS NOT NULL`, (err) => {
		if (err && !err.message.includes('no such column')) {
			logger.error(`Failed to copy ${sourceColumn} to ${targetColumn} on ${tableName}`, err);
		}
	});
}
