import type { HijriCalendarCacheEntry } from '../../storage/sqlite/repositories/HijriCalendarCacheRepository';

export interface HijriCalendarProvider {
	name: string;
	fetchGregorianMonth(month: number, year: number): Promise<HijriCalendarCacheEntry[]>;
}

interface AlAdhanCalendarResponse {
	code: number;
	status: string;
	data?: AlAdhanCalendarDate[];
}

interface AlAdhanCalendarDate {
	gregorian?: {
		day?: string;
		year?: string;
		month?: {
			number?: number;
			en?: string;
		};
	};
	hijri?: {
		day?: string;
		year?: string;
		month?: {
			number?: number;
			en?: string;
			ar?: string;
		};
	};
}

type FetchImplementation = typeof fetch;

export class AlAdhanHijriCalendarProvider implements HijriCalendarProvider {
	readonly name = 'aladhan';

	constructor(private fetchImplementation: FetchImplementation = fetch) {}

	async fetchGregorianMonth(month: number, year: number): Promise<HijriCalendarCacheEntry[]> {
		const url = buildAlAdhanHijriCalendarUrl(month, year);
		const response = await this.fetchImplementation(url);
		if (!response.ok) {
			throw new Error(`AlAdhan Hijri calendar request failed with status ${response.status}`);
		}

		const body = (await response.json()) as AlAdhanCalendarResponse;
		if (body.code !== 200 || !Array.isArray(body.data)) {
			throw new Error(`AlAdhan Hijri calendar response was invalid: ${body.status}`);
		}

		const fetchedAt = new Date().toISOString();
		return body.data.map((date) => this.toCacheEntry(date, fetchedAt));
	}

	private toCacheEntry(date: AlAdhanCalendarDate, fetchedAt: string): HijriCalendarCacheEntry {
		const gregorianDay = parseRequiredNumber(date.gregorian?.day, 'gregorian.day');
		const gregorianMonth = parseRequiredNumber(date.gregorian?.month?.number, 'gregorian.month.number');
		const gregorianYear = parseRequiredNumber(date.gregorian?.year, 'gregorian.year');

		return {
			gregorianDate: formatDateKey(gregorianYear, gregorianMonth, gregorianDay),
			hijriYear: parseRequiredNumber(date.hijri?.year, 'hijri.year'),
			hijriMonth: parseRequiredNumber(date.hijri?.month?.number, 'hijri.month.number'),
			hijriDay: parseRequiredNumber(date.hijri?.day, 'hijri.day'),
			hijriMonthNameAr: date.hijri?.month?.ar ?? '',
			hijriMonthNameEn: date.hijri?.month?.en ?? '',
			provider: this.name,
			fetchedAt,
		};
	}
}

export function buildAlAdhanHijriCalendarUrl(month: number, year: number): string {
	return `https://api.aladhan.com/v1/gToHCalendar/${month}/${year}`;
}

function parseRequiredNumber(value: string | number | null | undefined, label: string): number {
	const parsed = typeof value === 'number' ? value : Number.parseInt(value ?? '', 10);
	if (!Number.isFinite(parsed)) {
		throw new Error(`AlAdhan Hijri calendar response is missing ${label}`);
	}

	return parsed;
}

function formatDateKey(year: number, month: number, day: number): string {
	return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}
