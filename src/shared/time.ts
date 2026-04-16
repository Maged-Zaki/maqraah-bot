export interface ParsedReminderTime {
	displayTime: string;
	cronTime: string;
	minutesSinceMidnight: number;
}

type IntlWithSupportedValues = typeof Intl & {
	supportedValuesOf?: (key: 'timeZone') => string[];
};

let supportedTimeZones: Set<string> | null | undefined;

export function parseReminderTime(time: string | null | undefined): ParsedReminderTime | null {
	if (typeof time !== 'string') {
		return null;
	}

	const match = time.match(/^\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*$/i);
	if (!match) {
		return null;
	}

	const hour12 = Number.parseInt(match[1], 10);
	const minute = Number.parseInt(match[2], 10);
	const period = match[3].toUpperCase() as 'AM' | 'PM';

	if (hour12 < 1 || hour12 > 12 || minute < 0 || minute > 59) {
		return null;
	}

	const hour24 = period === 'PM' && hour12 !== 12 ? hour12 + 12 : period === 'AM' && hour12 === 12 ? 0 : hour12;
	const minutesSinceMidnight = hour24 * 60 + minute;
	const displayTime = `${hour12}:${minute.toString().padStart(2, '0')} ${period}`;

	return {
		displayTime,
		cronTime: minutesToCron(minutesSinceMidnight),
		minutesSinceMidnight,
	};
}

export function normalizeReminderTime(time: string | null | undefined): string | null {
	return parseReminderTime(time)?.displayTime ?? null;
}

export function parseTimeToCron(time: string | null | undefined): string | null {
	return parseReminderTime(time)?.cronTime ?? null;
}

export function parseTimeToMinutes(time: string | null | undefined): number | null {
	return parseReminderTime(time)?.minutesSinceMidnight ?? null;
}

export function minutesToCron(minutes: number): string {
	const normalizedMinutes = ((minutes % 1440) + 1440) % 1440;
	const hour = Math.floor(normalizedMinutes / 60);
	const minute = normalizedMinutes % 60;
	return `${minute} ${hour} * * *`;
}

export function normalizeTimeZone(timezone: string | null | undefined): string | null {
	if (typeof timezone !== 'string') {
		return null;
	}

	const trimmedTimezone = timezone.trim();
	if (trimmedTimezone.length === 0 || !isLikelyIanaTimeZoneName(trimmedTimezone)) {
		return null;
	}

	const supportedZones = getSupportedTimeZones();
	if (supportedZones?.has(trimmedTimezone)) {
		return trimmedTimezone;
	}

	const canonicalTimezone = getCanonicalTimeZone(trimmedTimezone);
	if (!canonicalTimezone) {
		return null;
	}

	if (!supportedZones || supportedZones.has(canonicalTimezone) || canonicalTimezone === 'UTC') {
		return canonicalTimezone;
	}

	return null;
}

export function isValidTimeZone(timezone: string | null | undefined): boolean {
	return normalizeTimeZone(timezone) !== null;
}

function getSupportedTimeZones(): Set<string> | null {
	if (supportedTimeZones !== undefined) {
		return supportedTimeZones;
	}

	const supportedValuesOf = (Intl as IntlWithSupportedValues).supportedValuesOf;
	if (typeof supportedValuesOf !== 'function') {
		supportedTimeZones = null;
		return supportedTimeZones;
	}

	try {
		supportedTimeZones = new Set(supportedValuesOf('timeZone'));
	} catch {
		supportedTimeZones = null;
	}

	return supportedTimeZones;
}

function getCanonicalTimeZone(timezone: string): string | null {
	try {
		return new Intl.DateTimeFormat('en-US', { timeZone: timezone }).resolvedOptions().timeZone;
	} catch {
		return null;
	}
}

function isLikelyIanaTimeZoneName(timezone: string): boolean {
	return timezone === 'UTC' || /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+$/.test(timezone);
}
