import assert from 'node:assert/strict';
import test from 'node:test';
import type { HijriCalendarCacheEntry } from '../../storage/sqlite/repositories/HijriCalendarCacheRepository';

process.env.DATABASE_PATH ??= ':memory:';

const { refreshHijriCalendarCache } = require('./calendarCache') as typeof import('./calendarCache');
const { AlAdhanHijriCalendarProvider, buildAlAdhanHijriCalendarUrl } = require('./calendarProvider') as typeof import('./calendarProvider');

test('calendar cache refresh stores current and next Gregorian months', async () => {
	const fetchedMonths: string[] = [];
	const cachedEntries: HijriCalendarCacheEntry[] = [];

	await refreshHijriCalendarCache({
		timezone: 'UTC',
		now: new Date('2026-04-25T12:00:00.000Z'),
		provider: {
			name: 'fake',
			fetchGregorianMonth: async (month: number, year: number) => {
				fetchedMonths.push(`${year}-${month}`);
				return [buildCacheEntry({ gregorianDate: `${year}-${month.toString().padStart(2, '0')}-01` })];
			},
		},
		repository: {
			upsertEntries: async (entries: HijriCalendarCacheEntry[]) => {
				cachedEntries.push(...entries);
			},
			getByGregorianDate: async () => null,
		} as any,
	});

	assert.deepEqual(fetchedMonths, ['2026-4', '2026-5']);
	assert.deepEqual(
		cachedEntries.map((entry) => entry.gregorianDate),
		['2026-04-01', '2026-05-01']
	);
});

test('AlAdhan calendar provider parses API results into cache entries', async () => {
	const requestedUrls: string[] = [];
	const provider = new AlAdhanHijriCalendarProvider(async (url: any) => {
		requestedUrls.push(url.toString());
		return {
			ok: true,
			status: 200,
			json: async () => ({
				code: 200,
				status: 'OK',
				data: [
					{
						gregorian: { day: '20', month: { number: 4, en: 'April' }, year: '2026' },
						hijri: { day: '03', month: { number: 11, en: "Dhu al-Qi'dah", ar: 'ذو القعدة' }, year: '1447' },
					},
				],
			}),
		} as any;
	});

	const entries = await provider.fetchGregorianMonth(4, 2026);

	assert.deepEqual(requestedUrls, [buildAlAdhanHijriCalendarUrl(4, 2026)]);
	assert.equal(entries[0].gregorianDate, '2026-04-20');
	assert.equal(entries[0].hijriYear, 1447);
	assert.equal(entries[0].hijriMonth, 11);
	assert.equal(entries[0].hijriDay, 3);
	assert.equal(entries[0].hijriMonthNameAr, 'ذو القعدة');
	assert.equal(entries[0].provider, 'aladhan');
});

function buildCacheEntry(overrides: Partial<HijriCalendarCacheEntry> = {}): HijriCalendarCacheEntry {
	return {
		gregorianDate: '2026-04-20',
		hijriYear: 1447,
		hijriMonth: 11,
		hijriDay: 3,
		hijriMonthNameAr: 'ذو القعدة',
		hijriMonthNameEn: "Dhu al-Qi'dah",
		provider: 'fake',
		fetchedAt: '2026-04-20T12:00:00.000Z',
		...overrides,
	};
}
