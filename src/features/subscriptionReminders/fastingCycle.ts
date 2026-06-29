import { formatLocalDateKey } from './dateUtils';
import { fastingCycleStateRepository } from '../../storage/sqlite';
import type { HijriCalendarCacheEntry } from '../../storage/sqlite/repositories/HijriCalendarCacheRepository';

export interface FastingCycleCheckResult {
	isFastDay: boolean;
	targetDate: string;
}

export function isAlternateDayFromLastFasted(currentDate: string, lastFastedDate: string | null): boolean {
	if (!lastFastedDate) {
		return true;
	}

	const current = new Date(currentDate);
	const last = new Date(lastFastedDate);
	const diffDays = Math.floor((current.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));

	return diffDays >= 2;
}

export function isEidDay(hijriDate: HijriCalendarCacheEntry | null): boolean {
	if (!hijriDate) {
		return false;
	}

	const eidShawwal = hijriDate.hijriMonth === 10 && hijriDate.hijriDay === 1;
	const eidAdhaTashriq = hijriDate.hijriMonth === 12 && hijriDate.hijriDay >= 10 && hijriDate.hijriDay <= 13;

	return eidShawwal || eidAdhaTashriq;
}

export async function checkDawwdCycle(
	sendDate: string,
	getCachedHijriDate: (date: string) => Promise<HijriCalendarCacheEntry | null>
): Promise<FastingCycleCheckResult> {
	const targetDate = sendDate;
	const hijriDate = await getCachedHijriDate(targetDate);

	if (isEidDay(hijriDate)) {
		return { isFastDay: false, targetDate };
	}

	const lastFastedDate = await fastingCycleStateRepository.getLastFastedDate('dawwd-alternate');

	return {
		isFastDay: isAlternateDayFromLastFasted(targetDate, lastFastedDate),
		targetDate,
	};
}

export async function recordDawwdFast(targetDate: string): Promise<void> {
	await fastingCycleStateRepository.setLastFastedDate('dawwd-alternate', targetDate);
}