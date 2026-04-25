import sqlite3 from 'sqlite3';
import { logger } from '../../../observability/logging/logger';

export interface HijriCalendarCacheEntry {
	gregorianDate: string;
	hijriYear: number;
	hijriMonth: number;
	hijriDay: number;
	hijriMonthNameAr: string;
	hijriMonthNameEn: string;
	provider: string;
	fetchedAt: string;
}

export class HijriCalendarCacheRepository {
	constructor(private db: sqlite3.Database) {}

	async upsertEntries(entries: HijriCalendarCacheEntry[]): Promise<void> {
		if (entries.length === 0) {
			return;
		}

		const startTime = Date.now();

		await new Promise<void>((resolve, reject) => {
			this.db.serialize(() => {
				const statement = this.db.prepare(
					`
						INSERT INTO hijri_calendar_cache (
							gregorianDate,
							hijriYear,
							hijriMonth,
							hijriDay,
							hijriMonthNameAr,
							hijriMonthNameEn,
							provider,
							fetchedAt
						)
						VALUES (?, ?, ?, ?, ?, ?, ?, ?)
						ON CONFLICT(gregorianDate) DO UPDATE SET
							hijriYear = excluded.hijriYear,
							hijriMonth = excluded.hijriMonth,
							hijriDay = excluded.hijriDay,
							hijriMonthNameAr = excluded.hijriMonthNameAr,
							hijriMonthNameEn = excluded.hijriMonthNameEn,
							provider = excluded.provider,
							fetchedAt = excluded.fetchedAt
					`
				);

				for (const entry of entries) {
					statement.run([
						entry.gregorianDate,
						entry.hijriYear,
						entry.hijriMonth,
						entry.hijriDay,
						entry.hijriMonthNameAr,
						entry.hijriMonthNameEn,
						entry.provider,
						entry.fetchedAt,
					]);
				}

				statement.finalize((err) => {
					const duration = Date.now() - startTime;
					if (err) {
						logger.error('Failed to upsert Hijri calendar cache entries', err, undefined, {
							operationType: 'database_upsert',
							operationStatus: 'failure',
							duration,
						});
						logger.recordDatabaseEvent('upsert', 'hijri_calendar_cache', duration, false, err.message);
						reject(err);
					} else {
						logger.recordDatabaseEvent('upsert', 'hijri_calendar_cache', duration, true);
						resolve();
					}
				});
			});
		});
	}

	async getByGregorianDate(gregorianDate: string): Promise<HijriCalendarCacheEntry | null> {
		const startTime = Date.now();

		return new Promise((resolve, reject) => {
			this.db.get(
				`SELECT * FROM hijri_calendar_cache WHERE gregorianDate = ?`,
				[gregorianDate],
				(err, row: HijriCalendarCacheEntry | undefined) => {
					const duration = Date.now() - startTime;
					if (err) {
						logger.error('Failed to get Hijri calendar cache entry', err, undefined, {
							operationType: 'database_read',
							operationStatus: 'failure',
							duration,
						});
						logger.recordDatabaseEvent('read', 'hijri_calendar_cache', duration, false, err.message);
						reject(err);
					} else {
						logger.recordDatabaseEvent('read', 'hijri_calendar_cache', duration, true);
						resolve(row ?? null);
					}
				}
			);
		});
	}
}
