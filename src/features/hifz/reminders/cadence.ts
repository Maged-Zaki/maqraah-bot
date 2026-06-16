import type { Configuration } from '../../../storage/sqlite/repositories/ConfigurationRepository';
import { minutesToCron, parseTimeToMinutes } from '../../../shared/time';
import { parseStoredWeekdays, getCronWeekdayValue } from '../../../shared/weekdays';
import { DEFAULT_HIFZ_TIME } from './sessionId';

export const hifzReminderStages = {
	PRE: 'pre',
	MAIN: 'main',
} as const;

export type HifzReminderStage = (typeof hifzReminderStages)[keyof typeof hifzReminderStages];

export interface HifzReminderStageSchedule {
	stage: HifzReminderStage;
	cronTime: string;
	sessionDateOffsetMinutes: number;
}

export const defaultHifzCadence = {
	preReminderEnabled: true,
	preReminderOffsetMinutes: 5,
	mainReminderEnabled: true,
} as const;

export function buildHifzReminderStageSchedules(configuration: Configuration): HifzReminderStageSchedule[] {
	const schedules: HifzReminderStageSchedule[] = [];
	const hifzTime = configuration.hifzTime ?? DEFAULT_HIFZ_TIME;
	const dailyMinutes = parseTimeToMinutes(hifzTime);

	if (dailyMinutes === null) {
		return schedules;
	}

	const hifzWeekdays = parseStoredWeekdays(configuration.hifzWeekdays);
	if (hifzWeekdays.length === 0) {
		return schedules;
	}

	const preOffset = getHifzReminderOffset(configuration.hifzPreReminderOffsetMinutes, defaultHifzCadence.preReminderOffsetMinutes);
	const [minute, hour] = minutesToCron(dailyMinutes).split(' ');

	if (isHifzReminderStageEnabled(configuration.hifzPreReminderEnabled, defaultHifzCadence.preReminderEnabled)) {
		const preMinute = ((dailyMinutes - preOffset) % 1440 + 1440) % 1440;
		const preHour = Math.floor(preMinute / 60);
		const preMinuteVal = preMinute % 60;
		schedules.push({
			stage: hifzReminderStages.PRE,
			cronTime: `${preMinuteVal} ${preHour} * * ${hifzWeekdays.map((wd) => getCronWeekdayValue(wd)).join(',')}`,
			sessionDateOffsetMinutes: preOffset,
		});
	}

	if (isHifzReminderStageEnabled(configuration.hifzReminderEnabled, defaultHifzCadence.mainReminderEnabled)) {
		schedules.push({
			stage: hifzReminderStages.MAIN,
			cronTime: `${minute} ${hour} * * ${hifzWeekdays.map((wd) => getCronWeekdayValue(wd)).join(',')}`,
			sessionDateOffsetMinutes: 0,
		});
	}

	return schedules;
}

export function getHifzReminderOffset(value: number | null | undefined, defaultValue: number): number {
	if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
		return defaultValue;
	}

	return value;
}

export function isHifzReminderStageEnabled(value: boolean | number | string | null | undefined, defaultValue: boolean): boolean {
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