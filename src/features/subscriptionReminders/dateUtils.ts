export interface LocalDateTimeParts {
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
}

export function getLocalDateTimeParts(date: Date, timezone: string): LocalDateTimeParts {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23',
	}).formatToParts(date);

	const getPart = (type: Intl.DateTimeFormatPartTypes): number => {
		const value = parts.find((part) => part.type === type)?.value;
		if (!value) {
			throw new Error(`Could not read ${type} from local date parts.`);
		}

		return Number.parseInt(value, 10);
	};

	return {
		year: getPart('year'),
		month: getPart('month'),
		day: getPart('day'),
		hour: getPart('hour'),
		minute: getPart('minute'),
	};
}

export function formatLocalDateKey(date: Date, timezone: string): string {
	const parts = getLocalDateTimeParts(date, timezone);
	return formatDateKey(parts.year, parts.month, parts.day);
}

export function addDaysToDateKey(dateKey: string, days: number): string {
	const [year, month, day] = parseDateKey(dateKey);
	const date = new Date(Date.UTC(year, month - 1, day + days));
	return formatDateKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function getWeekdayFromDateKey(dateKey: string): number {
	const [year, month, day] = parseDateKey(dateKey);
	return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function getGregorianMonthPairForCache(date: Date, timezone: string): { month: number; year: number }[] {
	const current = getLocalDateTimeParts(date, timezone);
	const nextMonthDate = new Date(Date.UTC(current.year, current.month, 1));

	return [
		{ month: current.month, year: current.year },
		{ month: nextMonthDate.getUTCMonth() + 1, year: nextMonthDate.getUTCFullYear() },
	];
}

export function isSameLocalHourAndMinute(date: Date, timezone: string, minutesSinceMidnight: number): boolean {
	const parts = getLocalDateTimeParts(date, timezone);
	return parts.hour * 60 + parts.minute === minutesSinceMidnight;
}

export function formatArabicDateLabel(dateKey: string): string {
	const [year, month, day] = parseDateKey(dateKey);
	const weekday = arabicWeekdayNames[getWeekdayFromDateKey(dateKey)] ?? '';
	return `${weekday} ${day}/${month}/${year}`.trim();
}

function formatDateKey(year: number, month: number, day: number): string {
	return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

function parseDateKey(dateKey: string): [number, number, number] {
	const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!match) {
		throw new Error(`Invalid date key: ${dateKey}`);
	}

	return [Number.parseInt(match[1], 10), Number.parseInt(match[2], 10), Number.parseInt(match[3], 10)];
}

const arabicWeekdayNames = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
