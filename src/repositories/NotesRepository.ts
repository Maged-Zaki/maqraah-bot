import sqlite3 from 'sqlite3';

export interface Note {
	id: number;
	userId: string;
	note: string;
	dateAdded: string;
}

export class NotesRepository {
	constructor(private db: sqlite3.Database) {}

	async addNote(userId: string, note: string): Promise<void> {
		return new Promise((resolve, reject) => {
			this.db.run(`INSERT INTO notes (userId, note, dateAdded) VALUES (?, ?, ?)`, [userId, note, new Date().toISOString()], function (err) {
				if (err) reject(err);
				else resolve();
			});
		});
	}

	async getAllNotes(): Promise<Note[]> {
		return new Promise((resolve, reject) => {
			this.db.all(`SELECT * FROM notes`, (err, rows: Note[]) => {
				if (err) reject(err);
				else resolve(rows);
			});
		});
	}

	async getNotesByUserId(userId: string): Promise<Note[]> {
		return new Promise((resolve, reject) => {
			this.db.all(`SELECT * FROM notes WHERE userId = ?`, [userId], (err, rows: Note[]) => {
				if (err) reject(err);
				else resolve(rows);
			});
		});
	}

	async deleteNotes(ids: number[]): Promise<void> {
		const placeholders = ids.map(() => '?').join(',');
		return new Promise((resolve, reject) => {
			this.db.run(`DELETE FROM notes WHERE id IN (${placeholders})`, ids, function (err) {
				if (err) reject(err);
				else resolve();
			});
		});
	}

	async deleteAllNotes(): Promise<void> {
		return new Promise((resolve, reject) => {
			this.db.run(`DELETE FROM notes`, function (err) {
				if (err) reject(err);
				else resolve();
			});
		});
	}
}
