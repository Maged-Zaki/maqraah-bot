import { hijriCalendarCacheRepository } from '../../storage/sqlite';
import type { HijriCalendarCacheRepository } from '../../storage/sqlite/repositories/HijriCalendarCacheRepository';
import { logger } from '../../observability/logging/logger';
import { getGregorianMonthPairForCache } from './dateUtils';
import { AlAdhanHijriCalendarProvider, type HijriCalendarProvider } from './calendarProvider';

export interface RefreshHijriCalendarCacheInput {
	timezone: string;
	now?: Date;
	provider?: HijriCalendarProvider;
	repository?: HijriCalendarCacheRepository;
}

export async function refreshHijriCalendarCache(input: RefreshHijriCalendarCacheInput): Promise<void> {
	const provider = input.provider ?? new AlAdhanHijriCalendarProvider();
	const repository = input.repository ?? hijriCalendarCacheRepository;
	const months = getGregorianMonthPairForCache(input.now ?? new Date(), input.timezone);

	for (const month of months) {
		try {
			const entries = await provider.fetchGregorianMonth(month.month, month.year);
			await repository.upsertEntries(entries);
			logger.info('Hijri calendar cache refreshed', undefined, {
				operationType: 'subscription_reminder_calendar_refresh',
				operationStatus: 'success',
				additionalData: { provider: provider.name, month: month.month, year: month.year, entryCount: entries.length },
			});
		} catch (error) {
			logger.warn('Failed to refresh Hijri calendar cache; existing cache will be used', undefined, {
				operationType: 'subscription_reminder_calendar_refresh',
				operationStatus: 'failure',
				additionalData: { provider: provider.name, month: month.month, year: month.year, error: (error as Error).message },
			});
		}
	}
}
