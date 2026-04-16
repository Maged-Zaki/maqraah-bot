import type { Configuration } from '../../storage/sqlite/repositories/ConfigurationRepository';
import { minutesToCron, parseTimeToMinutes } from '../../shared/time';

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
