import type { Configuration } from '../../../storage/sqlite/repositories/ConfigurationRepository';
import { parseTimeToMinutes } from '../../../shared/time';

interface TimeZoneDateParts {
	isoDate: string;
	minutesSinceMidnight: number;
}

export function getReminderSessionId(date: Date = new Date(), timezone?: string): string {
	if (!timezone) {
		return date.toISOString().slice(0, 10);
	}

	const dateParts = getTimeZoneDateParts(date, timezone);
	if (!dateParts) {
		return date.toISOString().slice(0, 10);
	}

	return dateParts.isoDate;
}

export function getUpcomingSessionId(configuration: Pick<Configuration, 'dailyTime' | 'timezone'>, now: Date = new Date()): string | null {
	const dailyMinutes = parseTimeToMinutes(configuration.dailyTime);
	if (dailyMinutes === null) {
		return null;
	}

	const dateParts = getTimeZoneDateParts(now, configuration.timezone);
	if (!dateParts) {
		return null;
	}

	if (dateParts.minutesSinceMidnight < dailyMinutes) {
		return dateParts.isoDate;
	}

	return addDaysToIsoDate(dateParts.isoDate, 1);
}

function getTimeZoneDateParts(date: Date, timezone: string): TimeZoneDateParts | null {
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
