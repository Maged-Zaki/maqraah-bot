import { Client } from 'discord.js';
import * as cron from 'node-cron';
import { configurationRepository } from '../../../storage/sqlite';
import { logger } from '../../../observability/logging/logger';
import { normalizeTimeZone } from '../../../shared/time';
import type { PrayerName } from '../../../shared/prayers';
import { fetchPrayerSyncTiming, getPrayerSyncOffsetMinutes, isPrayerSyncEnabled, type PrayerSyncTiming } from '../../../shared/prayerSync/timings';
import { scheduleReminder } from './scheduler';
import { updateReminderVoiceChannelName } from './voiceChannel';

export const DEFAULT_MAQRAAH_TIME_SYNC_PRAYER: PrayerName = 'maghrib';

export let maqraahTimeSyncJob: cron.ScheduledTask | null = null;

export interface MaqraahTimeSyncResult {
	enabled: boolean;
	changed: boolean;
	timing?: PrayerSyncTiming;
}

interface SyncOptions {
	reschedule?: boolean;
	updateVoiceChannel?: boolean;
	announceChange?: boolean;
}

export async function scheduleMaqraahTimeSync(client: Client, runImmediately: boolean = true): Promise<void> {
	stopMaqraahTimeSync();

	const configuration = await configurationRepository.getConfiguration();
	if (!isPrayerSyncEnabled(configuration.maqraahTimeSyncEnabled)) {
		logger.info('Maqraah time sync is disabled');
		return;
	}

	const timezone = normalizeTimeZone(configuration.timezone);
	if (!timezone) {
		logger.warn(`Invalid timezone configured for maqraah time sync: ${configuration.timezone}`, undefined, {
			additionalData: { timezone: configuration.timezone },
		});
		return;
	}

	maqraahTimeSyncJob = cron.schedule(
		'7 * * * *',
		async () => {
			await syncMaqraahTimeFromPrayerSafely(client);
		},
		{ timezone }
	);

	logger.recordSchedulerEvent('scheduled', {
		cronTime: '7 * * * *',
		timezone,
		stage: 'maqraah_time_sync_update',
	});

	if (runImmediately) {
		await syncMaqraahTimeFromPrayerSafely(client);
	}
}

export function stopMaqraahTimeSync(): void {
	if (maqraahTimeSyncJob) {
		maqraahTimeSyncJob.stop();
		maqraahTimeSyncJob = null;
		logger.recordSchedulerEvent('stopped', { stage: 'maqraah_time_sync_update' });
	}
}

export async function syncMaqraahTimeFromPrayer(client: Client, options: SyncOptions = {}): Promise<MaqraahTimeSyncResult> {
	const { reschedule = true, updateVoiceChannel = true, announceChange = true } = options;
	const configuration = await configurationRepository.getConfiguration();

	if (!isPrayerSyncEnabled(configuration.maqraahTimeSyncEnabled)) {
		return { enabled: false, changed: false };
	}

	const prayer = resolveMaqraahTimeSyncPrayer(configuration.maqraahTimeSyncPrayer);
	const offsetMinutes = getPrayerSyncOffsetMinutes(configuration.maqraahTimeSyncOffsetMinutes);
	const timing = await fetchPrayerSyncTiming(configuration, prayer, offsetMinutes);
	if (timing.reminderTime === configuration.dailyTime) {
		logger.info('Maqraah time is already synced from prayer time', undefined, {
			additionalData: {
				date: timing.date,
				prayer: timing.prayer,
				prayerTime: timing.prayerTime,
				roundedPrayerTime: timing.roundedPrayerTime,
				reminderTime: timing.reminderTime,
			},
		});
		return { enabled: true, changed: false, timing };
	}

	await configurationRepository.updateConfiguration({ dailyTime: timing.reminderTime });
	logger.info('Updated maqraah time from prayer time', undefined, {
		operationType: 'maqraah_time_sync',
		operationStatus: 'success',
		additionalData: {
			previousReminderTime: configuration.dailyTime,
			newReminderTime: timing.reminderTime,
			date: timing.date,
			prayer: timing.prayer,
			prayerTime: timing.prayerTime,
			roundedPrayerTime: timing.roundedPrayerTime,
		},
	});

	if (updateVoiceChannel) {
		await updateReminderVoiceChannelName(client, timing.reminderTime);
	}

	if (announceChange) {
		await announceMaqraahTimeChange(client, configuration.roleId, timing.reminderTime);
	}

	if (reschedule) {
		await scheduleReminder(client);
	}

	return { enabled: true, changed: true, timing };
}

export function resolveMaqraahTimeSyncPrayer(value: string | null | undefined): PrayerName {
	return isPrayerName(value) ? value : DEFAULT_MAQRAAH_TIME_SYNC_PRAYER;
}

async function syncMaqraahTimeFromPrayerSafely(client: Client): Promise<void> {
	try {
		await syncMaqraahTimeFromPrayer(client);
	} catch (error) {
		logger.error('Failed to sync maqraah time from prayer', error as Error, undefined, {
			operationType: 'maqraah_time_sync',
			operationStatus: 'failure',
		});
	}
}

async function announceMaqraahTimeChange(client: Client, roleId: string, dailyTime: string): Promise<void> {
	const channel = client.channels.cache.get(process.env.CHANNEL_ID!);

	if (!channel || !('send' in channel)) {
		logger.warn('Configured reminder channel was not found or is not sendable for Maqraah time sync announcement');
		return;
	}

	try {
		await (channel as any).send(`<@&${roleId}> Maqraah Time has been changed to \`${dailyTime}\`.`);
	} catch (error) {
		logger.error('Failed to announce Maqraah time sync change', error as Error);
	}
}

function isPrayerName(value: string | null | undefined): value is PrayerName {
	return value === 'fajr' || value === 'sunrise' || value === 'dhuhr' || value === 'asr' || value === 'maghrib' || value === 'isha';
}
