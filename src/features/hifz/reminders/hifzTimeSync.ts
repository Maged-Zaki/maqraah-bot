import { Client } from 'discord.js';
import * as cron from 'node-cron';
import { configurationRepository } from '../../../storage/sqlite';
import { logger } from '../../../observability/logging/logger';
import { normalizeTimeZone } from '../../../shared/time';
import type { PrayerName } from '../../../shared/prayers';
import { fetchPrayerSyncTiming, getPrayerSyncOffsetMinutes, isPrayerSyncEnabled } from '../../../shared/prayerSync/timings';
import { isHifzReminderStageEnabled } from './cadence';
import { resolveHifzRoleId } from '../role';
import { scheduleHifzReminder } from './scheduler';
import { DEFAULT_HIFZ_TIME } from './sessionId';

export const DEFAULT_HIFZ_TIME_SYNC_PRAYER: PrayerName = 'dhuhr';
export const DEFAULT_HIFZ_TIME_SYNC_OFFSET_MINUTES = 90;

export let hifzTimeSyncJob: cron.ScheduledTask | null = null;

export interface HifzTimeSyncResult {
	enabled: boolean;
	changed: boolean;
	reminderTime?: string;
}

interface SyncOptions {
	reschedule?: boolean;
	announceChange?: boolean;
	fetchImplementation?: typeof fetch;
}

export function isHifzEnabled(configuration: { hifzEnabled?: boolean | number | string | null }): boolean {
	return isHifzReminderStageEnabled(configuration.hifzEnabled, true);
}

export async function scheduleHifzTimeSync(client: Client, runImmediately: boolean = true): Promise<void> {
	stopHifzTimeSync();

	const configuration = await configurationRepository.getConfiguration();
	if (!isHifzEnabled(configuration)) {
		logger.info('Hifz is disabled, skipping hifz time sync');
		return;
	}

	if (!isPrayerSyncEnabled(configuration.hifzTimeSyncEnabled, true)) {
		logger.info('Hifz time sync is disabled');
		return;
	}

	const timezone = normalizeTimeZone(configuration.timezone);
	if (!timezone) {
		logger.warn(`Invalid timezone configured for hifz time sync: ${configuration.timezone}`, undefined, {
			additionalData: { timezone: configuration.timezone },
		});
		return;
	}

	hifzTimeSyncJob = cron.schedule(
		'12 * * * *',
		async () => {
			await syncHifzTimeFromPrayerSafely(client);
		},
		{ timezone }
	);

	logger.recordSchedulerEvent('scheduled', {
		cronTime: '12 * * * *',
		timezone,
		stage: 'hifz_time_sync_update',
	});

	if (runImmediately) {
		await syncHifzTimeFromPrayerSafely(client);
	}
}

export function stopHifzTimeSync(): void {
	if (hifzTimeSyncJob) {
		hifzTimeSyncJob.stop();
		hifzTimeSyncJob = null;
		logger.recordSchedulerEvent('stopped', { stage: 'hifz_time_sync_update' });
	}
}

export async function syncHifzTimeFromPrayer(client: Client, options: SyncOptions = {}): Promise<HifzTimeSyncResult> {
	const { reschedule = true, announceChange = true, fetchImplementation } = options;
	const configuration = await configurationRepository.getConfiguration();

	if (!isHifzEnabled(configuration) || !isPrayerSyncEnabled(configuration.hifzTimeSyncEnabled, true)) {
		return { enabled: false, changed: false };
	}

	const prayer = resolveHifzTimeSyncPrayer(configuration.hifzTimeSyncPrayer);
	const offsetMinutes = getPrayerSyncOffsetMinutes(configuration.hifzTimeSyncOffsetMinutes, DEFAULT_HIFZ_TIME_SYNC_OFFSET_MINUTES);
	const timing = await fetchPrayerSyncTiming(configuration, prayer, offsetMinutes, new Date(), fetchImplementation ?? fetch);
	if (timing.reminderTime === (configuration.hifzTime ?? DEFAULT_HIFZ_TIME)) {
		logger.info('Hifz time is already synced from prayer time', undefined, {
			additionalData: {
				date: timing.date,
				prayer: timing.prayer,
				prayerTime: timing.prayerTime,
				roundedPrayerTime: timing.roundedPrayerTime,
				reminderTime: timing.reminderTime,
			},
		});
		return { enabled: true, changed: false, reminderTime: timing.reminderTime };
	}

	const previousHifzTime = configuration.hifzTime ?? DEFAULT_HIFZ_TIME;
	await configurationRepository.updateConfiguration({ hifzTime: timing.reminderTime });
	logger.info('Updated hifz time from prayer time', undefined, {
		operationType: 'hifz_time_sync',
		operationStatus: 'success',
		additionalData: {
			previousHifzTime,
			newHifzTime: timing.reminderTime,
			date: timing.date,
			prayer: timing.prayer,
			prayerTime: timing.prayerTime,
			roundedPrayerTime: timing.roundedPrayerTime,
		},
	});

	if (announceChange) {
		await announceHifzTimeChange(client, resolveHifzRoleId(configuration), timing.reminderTime);
	}

	if (reschedule) {
		await scheduleHifzReminder(client);
	}

	return { enabled: true, changed: true, reminderTime: timing.reminderTime };
}

export function resolveHifzTimeSyncPrayer(value: string | null | undefined): PrayerName {
	return isPrayerName(value) ? value : DEFAULT_HIFZ_TIME_SYNC_PRAYER;
}

async function syncHifzTimeFromPrayerSafely(client: Client): Promise<void> {
	try {
		await syncHifzTimeFromPrayer(client);
	} catch (error) {
		logger.error('Failed to sync hifz time from prayer', error as Error, undefined, {
			operationType: 'hifz_time_sync',
			operationStatus: 'failure',
		});
	}
}

async function announceHifzTimeChange(client: Client, roleId: string, hifzTime: string): Promise<void> {
	const channel = client.channels.cache.get(process.env.CHANNEL_ID!);

	if (!channel || !('send' in channel)) {
		logger.warn('Configured reminder channel was not found or is not sendable for hifz time sync announcement');
		return;
	}

	try {
		await (channel as any).send(`<@&${roleId}> Hifz Time has been changed to \`${hifzTime}\`.`);
	} catch (error) {
		logger.error('Failed to announce hifz time sync change', error as Error);
	}
}

function isPrayerName(value: string | null | undefined): value is PrayerName {
	return value === 'fajr' || value === 'sunrise' || value === 'dhuhr' || value === 'asr' || value === 'maghrib' || value === 'isha';
}
