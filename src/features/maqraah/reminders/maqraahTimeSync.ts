import { Client } from 'discord.js';
import * as cron from 'node-cron';
import { configurationRepository } from '../../../storage/sqlite';
import { logger } from '../../../observability/logging/logger';
import { normalizeTimeZone } from '../../../shared/time';
import { fetchMaqraahTimeSyncTiming, isMaqraahTimeSyncEnabled, MaqraahTimeSyncTiming } from './prayerTimes';
import { scheduleReminder } from './scheduler';
import { updateReminderVoiceChannelName } from './voiceChannel';

export let maqraahTimeSyncJob: cron.ScheduledTask | null = null;

export interface MaqraahTimeSyncResult {
	enabled: boolean;
	changed: boolean;
	timing?: MaqraahTimeSyncTiming;
}

interface SyncOptions {
	reschedule?: boolean;
	updateVoiceChannel?: boolean;
	announceChange?: boolean;
}

export async function scheduleMaqraahTimeSync(client: Client, runImmediately: boolean = true): Promise<void> {
	stopMaqraahTimeSync();

	const configuration = await configurationRepository.getConfiguration();
	if (!isMaqraahTimeSyncEnabled(configuration.maqraahTimeSyncEnabled)) {
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
			await syncMaqraahTimeFromMaghribSafely(client);
		},
		{ timezone }
	);

	logger.recordSchedulerEvent('scheduled', {
		cronTime: '7 * * * *',
		timezone,
		stage: 'maqraah_time_sync_update',
	});

	if (runImmediately) {
		await syncMaqraahTimeFromMaghribSafely(client);
	}
}

export function stopMaqraahTimeSync(): void {
	if (maqraahTimeSyncJob) {
		maqraahTimeSyncJob.stop();
		maqraahTimeSyncJob = null;
		logger.recordSchedulerEvent('stopped', { stage: 'maqraah_time_sync_update' });
	}
}

export async function syncMaqraahTimeFromMaghrib(client: Client, options: SyncOptions = {}): Promise<MaqraahTimeSyncResult> {
	const { reschedule = true, updateVoiceChannel = true, announceChange = true } = options;
	const configuration = await configurationRepository.getConfiguration();

	if (!isMaqraahTimeSyncEnabled(configuration.maqraahTimeSyncEnabled)) {
		return { enabled: false, changed: false };
	}

	const timing = await fetchMaqraahTimeSyncTiming(configuration);
	if (timing.reminderTime === configuration.dailyTime) {
		logger.info('Maqraah time is already synced from Maghrib', undefined, {
			additionalData: {
				date: timing.date,
				maghribTime: timing.maghribTime,
				roundedMaghribTime: timing.roundedMaghribTime,
				reminderTime: timing.reminderTime,
			},
		});
		return { enabled: true, changed: false, timing };
	}

	await configurationRepository.updateConfiguration({ dailyTime: timing.reminderTime });
	logger.info('Updated maqraah time from Maghrib prayer time', undefined, {
		operationType: 'maqraah_time_sync',
		operationStatus: 'success',
		additionalData: {
			previousReminderTime: configuration.dailyTime,
			newReminderTime: timing.reminderTime,
			date: timing.date,
			maghribTime: timing.maghribTime,
			roundedMaghribTime: timing.roundedMaghribTime,
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

async function syncMaqraahTimeFromMaghribSafely(client: Client): Promise<void> {
	try {
		await syncMaqraahTimeFromMaghrib(client);
	} catch (error) {
		logger.error('Failed to sync maqraah time from Maghrib', error as Error, undefined, {
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
