import sqlite3 from 'sqlite3';

if (!process.env.DATABASE_PATH) {
	throw new Error('DATABASE_PATH is not defined in environment variables.');
}

const db = new sqlite3.Database(process.env.DATABASE_PATH);

db.serialize(() => {
	db.run(`
	   CREATE TABLE IF NOT EXISTS config (
	     id INTEGER PRIMARY KEY DEFAULT 1,
	     lastPage INTEGER DEFAULT 0,
	     lastHadith INTEGER DEFAULT 0,
	     roleId TEXT DEFAULT 'Not set',
	     dailyTime TEXT DEFAULT '12:00 PM',
	     timezone TEXT DEFAULT 'Africa/Cairo',
	     voiceChannelId TEXT DEFAULT ''
	   )
	 `);
	db.run(`INSERT OR IGNORE INTO config (id) VALUES (1)`);
	db.run(`
	   CREATE TABLE IF NOT EXISTS notes (
	     id INTEGER PRIMARY KEY AUTOINCREMENT,
	     userId TEXT NOT NULL,
	     note TEXT NOT NULL,
	     dateAdded TEXT NOT NULL
	   )
	 `);
});

export interface Config {
	lastPage: number;
	lastHadith: number;
	roleId?: string;
	dailyTime: string;
	timezone: string;
	voiceChannelId?: string;
}

export interface Note {
	id: number;
	userId: string;
	note: string;
	dateAdded: string;
}

export function getConfig(): Promise<Config> {
	return new Promise((resolve, reject) => {
		db.get('SELECT * FROM config WHERE id = 1', (err, row: any) => {
			if (err) reject(err);
			else resolve(row as Config);
		});
	});
}

export function updateConfig(updates: Partial<Config>): Promise<void> {
	const fields = Object.keys(updates);
	const values = Object.values(updates);
	const setClause = fields.map((field) => `${field} = ?`).join(', ');
	return new Promise((resolve, reject) => {
		db.run(`UPDATE config SET ${setClause} WHERE id = 1`, values, function (err) {
			if (err) reject(err);
			else resolve();
		});
	});
}

export function addNote(userId: string, note: string): Promise<void> {
	return new Promise((resolve, reject) => {
		db.run(`INSERT INTO notes (userId, note, dateAdded) VALUES (?, ?, ?)`, [userId, note, new Date().toISOString()], function (err) {
			if (err) reject(err);
			else resolve();
		});
	});
}

export function getAllNotes(): Promise<Note[]> {
	return new Promise((resolve, reject) => {
		db.all(`SELECT * FROM notes`, (err, rows: Note[]) => {
			if (err) reject(err);
			else resolve(rows);
		});
	});
}

export function getNotesByUserId(userId: string): Promise<Note[]> {
	return new Promise((resolve, reject) => {
		db.all(`SELECT * FROM notes WHERE userId = ?`, [userId], (err, rows: Note[]) => {
			if (err) reject(err);
			else resolve(rows);
		});
	});
}

export function deleteNotes(ids: number[]): Promise<void> {
	const placeholders = ids.map(() => '?').join(',');
	return new Promise((resolve, reject) => {
		db.run(`DELETE FROM notes WHERE id IN (${placeholders})`, ids, function (err) {
			if (err) reject(err);
			else resolve();
		});
	});
}

export default db;
