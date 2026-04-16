import type { Configuration } from '../../storage/sqlite/repositories/ConfigurationRepository';

export const reminderStages = {
	PRE: 'pre',
	MAIN: 'main',
} as const;

export type ReminderStage = (typeof reminderStages)[keyof typeof reminderStages];

export interface ReminderStageSchedule {
	stage: ReminderStage;
	cronTime: string;
	sessionDateOffsetMinutes: number;
}

export const defaultReminderCadence = {
	preReminderEnabled: true,
	preReminderOffsetMinutes: 5,
	mainReminderEnabled: true,
} as const;

export function buildReminderStageSchedules(configuration: Configuration): ReminderStageSchedule[] {
	const schedules: ReminderStageSchedule[] = [];
	const dailyMinutes = parseTimeToMinutes(configuration.dailyTime);

	if (dailyMinutes === null) {
		return schedules;
	}

	const preOffset = getReminderOffset(configuration.preReminderOffsetMinutes, defaultReminderCadence.preReminderOffsetMinutes);

	if (isReminderStageEnabled(configuration.preReminderEnabled, defaultReminderCadence.preReminderEnabled)) {
		schedules.push({
			stage: reminderStages.PRE,
			cronTime: minutesToCron(dailyMinutes - preOffset),
			sessionDateOffsetMinutes: preOffset,
		});
	}

	if (isReminderStageEnabled(configuration.mainReminderEnabled, defaultReminderCadence.mainReminderEnabled)) {
		schedules.push({
			stage: reminderStages.MAIN,
			cronTime: minutesToCron(dailyMinutes),
			sessionDateOffsetMinutes: 0,
		});
	}

	return schedules;
}

export function parseTimeToCron(time: string): string | null {
	const minutes = parseTimeToMinutes(time);
	return minutes === null ? null : minutesToCron(minutes);
}

export function parseTimeToMinutes(time: string): number | null {
	const match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
	if (!match) return null;

	let hour = Number.parseInt(match[1], 10);
	const minute = Number.parseInt(match[2], 10);
	const ampm = match[3].toUpperCase();

	if (hour < 1 || hour > 12 || minute < 0 || minute > 59) {
		return null;
	}

	if (ampm === 'PM' && hour !== 12) hour += 12;
	if (ampm === 'AM' && hour === 12) hour = 0;

	return hour * 60 + minute;
}

export function minutesToCron(minutes: number): string {
	const normalizedMinutes = ((minutes % 1440) + 1440) % 1440;
	const hour = Math.floor(normalizedMinutes / 60);
	const minute = normalizedMinutes % 60;
	return `${minute} ${hour} * * *`;
}

export function getReminderOffset(value: number | null | undefined, defaultValue: number): number {
	if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
		return defaultValue;
	}

	return value;
}

export function isReminderStageEnabled(value: boolean | number | string | null | undefined, defaultValue: boolean): boolean {
	if (value === null || value === undefined) {
		return defaultValue;
	}

	if (typeof value === 'boolean') {
		return value;
	}

	if (typeof value === 'number') {
		return value !== 0;
	}

	return value !== '0' && value.toLowerCase() !== 'false';
}

export function isValidTimeZone(timezone: string): boolean {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: timezone });
		return true;
	} catch {
		return false;
	}
}
