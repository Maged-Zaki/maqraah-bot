import type { Schedule } from '../../storage/sqlite/repositories/ScheduleRepository';
import { scheduleStatuses, scheduleTypes } from '../../storage/sqlite/repositories/ScheduleRepository';
import { minutesToCron, parseReminderTime, parseTimeToMinutes } from '../../shared/time';

export interface WeekdayOption {
	key: string;
	value: number;
	label: string;
	cronValue: number;
}

export interface ScheduleCronEntry {
	cronTime: string;
	weekday?: number;
}

export interface ScheduleRun {
	date: string;
	time: string;
	timezone: string;
}

interface TimeZoneDateParts {
	isoDate: string;
	minutesSinceMidnight: number;
	isoWeekday: number;
}

export const weekdayOptions: WeekdayOption[] = [
	{ key: 'monday', value: 1, label: 'Monday', cronValue: 1 },
	{ key: 'tuesday', value: 2, label: 'Tuesday', cronValue: 2 },
	{ key: 'wednesday', value: 3, label: 'Wednesday', cronValue: 3 },
	{ key: 'thursday', value: 4, label: 'Thursday', cronValue: 4 },
	{ key: 'friday', value: 5, label: 'Friday', cronValue: 5 },
	{ key: 'saturday', value: 6, label: 'Saturday', cronValue: 6 },
	{ key: 'sunday', value: 7, label: 'Sunday', cronValue: 0 },
];

const weekdayByKey = new Map(weekdayOptions.map((weekday) => [weekday.key, weekday]));
const weekdayByValue = new Map(weekdayOptions.map((weekday) => [weekday.value, weekday]));
const allWeekdayValues = weekdayOptions.map((weekday) => weekday.value);
const weekdayValues = [1, 2, 3, 4, 5];
const weekendValues = [6, 7];

export function parseWeekdayValues(values: string[]): number[] | null {
	const weekdays = values
		.map((value) => {
			const byKey = weekdayByKey.get(value);
			if (byKey) {
				return byKey.value;
			}

			const numberValue = Number.parseInt(value, 10);
			return weekdayByValue.has(numberValue) ? numberValue : null;
		})
		.filter((value): value is number => value !== null);

	if (weekdays.length !== values.length || weekdays.length === 0) {
		return null;
	}

	return normalizeWeekdays(weekdays);
}

export function parseStoredWeekdays(value: string | null | undefined): number[] {
	if (!value) {
		return [];
	}

	return normalizeWeekdays(
		value
			.split(',')
			.map((part) => Number.parseInt(part, 10))
			.filter((part) => weekdayByValue.has(part))
	);
}

export function serializeWeekdays(weekdays: number[]): string {
	return normalizeWeekdays(weekdays).join(',');
}

export function formatWeekdays(weekdays: number[]): string {
	const normalizedWeekdays = normalizeWeekdays(weekdays);

	if (arraysEqual(normalizedWeekdays, allWeekdayValues)) {
		return 'every day';
	}

	if (arraysEqual(normalizedWeekdays, weekdayValues)) {
		return 'weekdays';
	}

	if (arraysEqual(normalizedWeekdays, weekendValues)) {
		return 'weekends';
	}

	const labels = normalizedWeekdays.map((weekday) => weekdayByValue.get(weekday)?.label ?? String(weekday));
	return joinHumanList(labels);
}

export function isValidScheduleDate(date: string | null | undefined): boolean {
	if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
		return false;
	}

	const [year, month, day] = date.split('-').map((part) => Number.parseInt(part, 10));
	const parsedDate = new Date(Date.UTC(year, month - 1, day));

	return (
		parsedDate.getUTCFullYear() === year &&
		parsedDate.getUTCMonth() === month - 1 &&
		parsedDate.getUTCDate() === day
	);
}

export function buildScheduleCronEntries(schedule: Schedule, timezone: string, now: Date = new Date()): ScheduleCronEntry[] {
	if (schedule.status !== scheduleStatuses.ACTIVE) {
		return [];
	}

	const parsedTime = parseReminderTime(schedule.time);
	if (!parsedTime) {
		return [];
	}

	if (schedule.type === scheduleTypes.ONE_TIME) {
		if (!isValidScheduleDate(schedule.oneTimeDate) || isOneTimeSchedulePast(schedule, timezone, now)) {
			return [];
		}

		return [{ cronTime: parsedTime.cronTime }];
	}

	const weekdays = parseStoredWeekdays(schedule.weekdays);
	if (weekdays.length === 0) {
		return [];
	}

	const [minute, hour] = parsedTime.cronTime.split(' ');
	return weekdays.map((weekday) => ({
		cronTime: `${minute} ${hour} * * ${weekdayByValue.get(weekday)?.cronValue ?? weekday}`,
		weekday,
	}));
}

export function getNextScheduleRuns(schedule: Schedule, timezone: string | null, count: number = 3, now: Date = new Date()): ScheduleRun[] {
	if (!timezone || schedule.status !== scheduleStatuses.ACTIVE || count <= 0) {
		return [];
	}

	const scheduledMinutes = parseTimeToMinutes(schedule.time);
	if (scheduledMinutes === null) {
		return [];
	}

	const currentDate = getTimeZoneDateParts(now, timezone);
	if (!currentDate) {
		return [];
	}

	if (schedule.type === scheduleTypes.ONE_TIME) {
		if (!isValidScheduleDate(schedule.oneTimeDate)) {
			return [];
		}

		const comparison = compareIsoDateTime(schedule.oneTimeDate!, scheduledMinutes, currentDate.isoDate, currentDate.minutesSinceMidnight);
		return comparison > 0 ? [{ date: schedule.oneTimeDate!, time: schedule.time, timezone }] : [];
	}

	const weekdays = parseStoredWeekdays(schedule.weekdays);
	if (weekdays.length === 0) {
		return [];
	}

	const runs: ScheduleRun[] = [];
	for (let dayOffset = 0; dayOffset < 370 && runs.length < count; dayOffset++) {
		const candidateDate = addDaysToIsoDate(currentDate.isoDate, dayOffset);
		const candidateWeekday = getIsoWeekday(candidateDate);
		if (!weekdays.includes(candidateWeekday)) {
			continue;
		}

		if (dayOffset === 0 && scheduledMinutes <= currentDate.minutesSinceMidnight) {
			continue;
		}

		runs.push({ date: candidateDate, time: schedule.time, timezone });
	}

	return runs;
}

export function shouldExecuteScheduleNow(schedule: Schedule, timezone: string, now: Date = new Date()): boolean {
	const scheduledMinutes = parseTimeToMinutes(schedule.time);
	const currentDate = getTimeZoneDateParts(now, timezone);

	if (scheduledMinutes === null || !currentDate || currentDate.minutesSinceMidnight !== scheduledMinutes) {
		return false;
	}

	if (schedule.type === scheduleTypes.ONE_TIME) {
		return schedule.oneTimeDate === currentDate.isoDate;
	}

	return parseStoredWeekdays(schedule.weekdays).includes(currentDate.isoWeekday);
}

export function isOneTimeSchedulePast(schedule: Schedule, timezone: string, now: Date = new Date()): boolean {
	if (schedule.type !== scheduleTypes.ONE_TIME || !isValidScheduleDate(schedule.oneTimeDate)) {
		return false;
	}

	const scheduledMinutes = parseTimeToMinutes(schedule.time);
	const currentDate = getTimeZoneDateParts(now, timezone);
	if (scheduledMinutes === null || !currentDate) {
		return false;
	}

	return compareIsoDateTime(schedule.oneTimeDate!, scheduledMinutes, currentDate.isoDate, currentDate.minutesSinceMidnight) < 0;
}

export function getTimeZoneDateParts(date: Date, timezone: string): TimeZoneDateParts | null {
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

		const isoDate = `${year}-${month}-${day}`;
		return {
			isoDate,
			minutesSinceMidnight: Number.parseInt(hour, 10) * 60 + Number.parseInt(minute, 10),
			isoWeekday: getIsoWeekday(isoDate),
		};
	} catch {
		return null;
	}
}

export function formatScheduleRun(run: ScheduleRun): string {
	return `${run.date} at ${run.time} (${run.timezone})`;
}

function normalizeWeekdays(weekdays: number[]): number[] {
	return [...new Set(weekdays.filter((weekday) => weekdayByValue.has(weekday)))].sort((left, right) => left - right);
}

function arraysEqual(left: number[], right: number[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function joinHumanList(values: string[]): string {
	if (values.length <= 2) {
		return values.join(' and ');
	}

	return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`;
}

function compareIsoDateTime(leftDate: string, leftMinutes: number, rightDate: string, rightMinutes: number): number {
	if (leftDate < rightDate) {
		return -1;
	}

	if (leftDate > rightDate) {
		return 1;
	}

	return leftMinutes - rightMinutes;
}

function getIsoWeekday(isoDate: string): number {
	const [year, month, day] = isoDate.split('-').map((value) => Number.parseInt(value, 10));
	const utcDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
	return utcDay === 0 ? 7 : utcDay;
}

function addDaysToIsoDate(isoDate: string, days: number): string {
	const [year, month, day] = isoDate.split('-').map((value) => Number.parseInt(value, 10));
	const utcDate = new Date(Date.UTC(year, month - 1, day));
	utcDate.setUTCDate(utcDate.getUTCDate() + days);

	return utcDate.toISOString().slice(0, 10);
}
