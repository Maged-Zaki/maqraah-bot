import sqlite3 from 'sqlite3';

export interface FastingCycleState {
	cycleKey: string;
	lastFastedDate: string | null;
	updatedAt: string | null;
}

export class FastingCycleStateRepository {
	constructor(private db: sqlite3.Database) {}

	async getState(cycleKey: string): Promise<FastingCycleState | null> {
		return new Promise((resolve, reject) => {
			this.db.get(
				`SELECT * FROM fasting_cycle_state WHERE cycleKey = ?`,
				[cycleKey],
				(err, row: FastingCycleState | undefined) => {
					if (err) {
						reject(err);
					} else {
						resolve(row ?? null);
					}
				}
			);
		});
	}

	async getLastFastedDate(cycleKey: string): Promise<string | null> {
		const state = await this.getState(cycleKey);
		return state?.lastFastedDate ?? null;
	}

	async setLastFastedDate(cycleKey: string, date: string): Promise<void> {
		const now = new Date().toISOString();
		await new Promise<void>((resolve, reject) => {
			this.db.run(
				`INSERT INTO fasting_cycle_state (cycleKey, lastFastedDate, updatedAt)
				 VALUES (?, ?, ?)
				 ON CONFLICT(cycleKey) DO UPDATE SET
					 lastFastedDate = excluded.lastFastedDate,
					 updatedAt = excluded.updatedAt`,
				[cycleKey, date, now],
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

	async clearState(cycleKey: string): Promise<void> {
		await new Promise<void>((resolve, reject) => {
			this.db.run(
				`DELETE FROM fasting_cycle_state WHERE cycleKey = ?`,
				[cycleKey],
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