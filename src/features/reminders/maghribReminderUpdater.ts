import { Client } from 'discord.js';
import * as cron from 'node-cron';
import { configurationRepository } from '../../infrastructure/database';
import { logger } from '../../infrastructure/logging/logger';
import { isValidTimeZone } from './cadence';
import { fetchMaghribReminderTiming, isMaghribReminderEnabled, MaghribReminderTiming } from './prayerTimes';
import { scheduleReminder } from './scheduler';
import { updateReminderVoiceChannelName } from './voiceChannel';

export let maghribReminderUpdateJob: cron.ScheduledTask | null = null;

export interface MaghribReminderSyncResult {
	enabled: boolean;
	changed: boolean;
	timing?: MaghribReminderTiming;
}

interface SyncOptions {
	reschedule?: boolean;
	updateVoiceChannel?: boolean;
}

export async function scheduleMaghribReminderUpdater(client: Client, runImmediately: boolean = true): Promise<void> {
	stopMaghribReminderUpdater();

	const configuration = await configurationRepository.getConfiguration();
	if (!isMaghribReminderEnabled(configuration.maghribReminderEnabled)) {
		logger.info('Maghrib reminder automation is disabled');
		return;
	}

	if (!isValidTimeZone(configuration.timezone)) {
		logger.warn(`Invalid timezone configured for Maghrib reminder updater: ${configuration.timezone}`, undefined, {
			additionalData: { timezone: configuration.timezone },
		});
		return;
	}

	maghribReminderUpdateJob = cron.schedule(
		'7 * * * *',
		async () => {
			await syncMaghribReminderTimeSafely(client);
		},
		{ timezone: configuration.timezone }
	);

	logger.recordSchedulerEvent('scheduled', {
		cronTime: '7 * * * *',
		timezone: configuration.timezone,
		stage: 'maghrib_reminder_update',
	});

	if (runImmediately) {
		await syncMaghribReminderTimeSafely(client);
	}
}

export function stopMaghribReminderUpdater(): void {
	if (maghribReminderUpdateJob) {
		maghribReminderUpdateJob.stop();
		maghribReminderUpdateJob = null;
		logger.recordSchedulerEvent('stopped', { stage: 'maghrib_reminder_update' });
	}
}

export async function syncMaghribReminderTime(client: Client, options: SyncOptions = {}): Promise<MaghribReminderSyncResult> {
	const { reschedule = true, updateVoiceChannel = true } = options;
	const configuration = await configurationRepository.getConfiguration();

	if (!isMaghribReminderEnabled(configuration.maghribReminderEnabled)) {
		return { enabled: false, changed: false };
	}

	const timing = await fetchMaghribReminderTiming(configuration);
	if (timing.reminderTime === configuration.dailyTime) {
		logger.info('Maghrib reminder time is already up to date', undefined, {
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
	logger.info('Updated reminder time from Maghrib prayer time', undefined, {
		operationType: 'maghrib_reminder_sync',
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

	if (reschedule) {
		await scheduleReminder(client);
	}

	return { enabled: true, changed: true, timing };
}

async function syncMaghribReminderTimeSafely(client: Client): Promise<void> {
	try {
		await syncMaghribReminderTime(client);
	} catch (error) {
		logger.error('Failed to sync Maghrib reminder time', error as Error, undefined, {
			operationType: 'maghrib_reminder_sync',
			operationStatus: 'failure',
		});
	}
}
