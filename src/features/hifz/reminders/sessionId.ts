import type { Configuration } from '../../../storage/sqlite/repositories/ConfigurationRepository';
import { parseTimeToMinutes } from '../../../shared/time';

export const HIFZ_SESSION_ID_PREFIX = 'hifz-';

interface TimeZoneDateParts {
	isoDate: string;
	minutesSinceMidnight: number;
}

export function getHifzReminderSessionId(date: Date = new Date(), timezone?: string): string {
	return `${HIFZ_SESSION_ID_PREFIX}${getBaseSessionId(date, timezone)}`;
}

export function getUpcomingHifzSessionId(
	configuration: Pick<Configuration, 'hifzTime' | 'timezone'>,
	now: Date = new Date()
): string | null {
	const hifzTime = configuration.hifzTime ?? DEFAULT_HIFZ_TIME;
	const dailyMinutes = parseTimeToMinutes(hifzTime);
	if (dailyMinutes === null) {
		return null;
	}

	const dateParts = getTimeZoneDateParts(now, configuration.timezone);
	if (!dateParts) {
		return null;
	}

	if (dateParts.minutesSinceMidnight < dailyMinutes) {
		return `${HIFZ_SESSION_ID_PREFIX}${dateParts.isoDate}`;
	}

	return `${HIFZ_SESSION_ID_PREFIX}${addDaysToIsoDate(dateParts.isoDate, 1)}`;
}

export function stripHifzSessionIdPrefix(sessionId: string): string {
	return sessionId.startsWith(HIFZ_SESSION_ID_PREFIX) ? sessionId.slice(HIFZ_SESSION_ID_PREFIX.length) : sessionId;
}

export const DEFAULT_HIFZ_TIME = '6:00 PM';

function getBaseSessionId(date: Date, timezone?: string): string {
	if (!timezone) {
		return date.toISOString().slice(0, 10);
	}

	const dateParts = getTimeZoneDateParts(date, timezone);
	if (!dateParts) {
		return date.toISOString().slice(0, 10);
	}

	return dateParts.isoDate;
}

function getTimeZoneDateParts(date: Date, timezone?: string): TimeZoneDateParts | null {
	if (!timezone) {
		return null;
	}

	try {
		const formatter = new Intl.DateTimeFormat('en-US', {
			timeZone: timezone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23',
		});
		const parts = formatter.formatToParts(date);
		const year = parts.find((part) => part.type === 'year')?.value;
		const month = parts.find((part) => part.type === 'month')?.value;
		const day = parts.find((part) => part.type === 'day')?.value;
		const hour = parts.find((part) => part.type === 'hour')?.value;
		const minute = parts.find((part) => part.type === 'minute')?.value;

		if (!year || !month || !day || !hour || !minute) {
			return null;
		}

		return {
			isoDate: `${year}-${month}-${day}`,
			minutesSinceMidnight: Number.parseInt(hour, 10) * 60 + Number.parseInt(minute, 10),
		};
	} catch {
		return null;
	}
}

function addDaysToIsoDate(isoDate: string, days: number): string {
	const [year, month, day] = isoDate.split('-').map((value) => Number.parseInt(value, 10));
	const utcDate = new Date(Date.UTC(year, month - 1, day));
	utcDate.setUTCDate(utcDate.getUTCDate() + days);

	return utcDate.toISOString().slice(0, 10);
}
