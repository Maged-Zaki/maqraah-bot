import sqlite3 from 'sqlite3';
import { ConfigurationRepository } from './repositories/ConfigurationRepository';
import { ProgressRepository } from './repositories/ProgressRepository';
import { NotesRepository } from './repositories/NotesRepository';
import { logger } from './logger';

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
	     voiceChannelId TEXT DEFAULT ''
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
