import sqlite3 from 'sqlite3';

export interface Progress {
	lastPage: number;
	lastHadith: number;
}

export class ProgressRepository {
	constructor(private db: sqlite3.Database) {}

	async getProgress(): Promise<Progress> {
		return new Promise((resolve, reject) => {
			this.db.get('SELECT * FROM progress WHERE id = 1', (err, row: any) => {
				if (err) reject(err);
				else resolve(row as Progress);
			});
		});
	}

	async updateProgress(updates: Partial<Progress>): Promise<void> {
		const fields = Object.keys(updates);
		const values = Object.values(updates);
		const setClause = fields.map((field) => `${field} = ?`).join(', ');
		return new Promise((resolve, reject) => {
			this.db.run(`UPDATE progress SET ${setClause} WHERE id = 1`, values, function (err) {
				if (err) reject(err);
				else resolve();
			});
		});
	}
}
