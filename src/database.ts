import sqlite3 from 'sqlite3';
import { ConfigurationRepository } from './repositories/ConfigurationRepository';
import { ProgressRepository } from './repositories/ProgressRepository';
import { NotesRepository } from './repositories/NotesRepository';

if (!process.env.DATABASE_PATH) {
	throw new Error('DATABASE_PATH is not defined in environment variables.');
}

const db = new sqlite3.Database(process.env.DATABASE_PATH);

db.serialize(() => {
	// Create new tables
	db.run(`
	   CREATE TABLE IF NOT EXISTS configuration (
	     id INTEGER PRIMARY KEY DEFAULT 1,
	     roleId TEXT DEFAULT 'Not set',
	     dailyTime TEXT DEFAULT '12:00 PM',
	     timezone TEXT DEFAULT 'Africa/Cairo',
	     voiceChannelId TEXT DEFAULT ''
	   )
	 `);
	db.run(`INSERT OR IGNORE INTO configuration (id) VALUES (1)`);
	db.run(`
	   CREATE TABLE IF NOT EXISTS progress (
	     id INTEGER PRIMARY KEY DEFAULT 1,
	     lastPage INTEGER DEFAULT 0,
	     lastHadith INTEGER DEFAULT 0
	   )
	 `);
	db.run(`INSERT OR IGNORE INTO progress (id) VALUES (1)`);
	db.run(`
	   CREATE TABLE IF NOT EXISTS notes (
	     id INTEGER PRIMARY KEY AUTOINCREMENT,
	     userId TEXT NOT NULL,
	     note TEXT NOT NULL,
	     dateAdded TEXT NOT NULL
	   )
	 `);
});

// Create repository instances
export const configurationRepository = new ConfigurationRepository(db);
export const progressRepository = new ProgressRepository(db);
export const notesRepository = new NotesRepository(db);
