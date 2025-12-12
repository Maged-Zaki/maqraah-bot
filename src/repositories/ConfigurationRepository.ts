import sqlite3 from 'sqlite3';

export interface Configuration {
	roleId: string;
	dailyTime: string;
	timezone: string;
	voiceChannelId: string;
}

export class ConfigurationRepository {
	constructor(private db: sqlite3.Database) {}

	async getConfiguration(): Promise<Configuration> {
		return new Promise((resolve, reject) => {
			this.db.get('SELECT * FROM configuration WHERE id = 1', (err, row: any) => {
				if (err) reject(err);
				else resolve(row as Configuration);
			});
		});
	}

	async updateConfiguration(updates: Partial<Configuration>): Promise<void> {
		const fields = Object.keys(updates);
		const values = Object.values(updates);
		const setClause = fields.map((field) => `${field} = ?`).join(', ');
		return new Promise((resolve, reject) => {
			this.db.run(`UPDATE configuration SET ${setClause} WHERE id = 1`, values, function (err) {
				if (err) reject(err);
				else resolve();
			});
		});
	}
}
