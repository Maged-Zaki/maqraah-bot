import { Client, MessageFlags } from 'discord.js';
import * as cron from 'node-cron';
import {
	configurationRepository,
	hijriCalendarCacheRepository,
	reminderSettingsRepository,
	subscriptionReminderEventsRepository,
} from '../../storage/sqlite';
import type { Configuration } from '../../storage/sqlite/repositories/ConfigurationRepository';
import type { HijriCalendarCacheEntry } from '../../storage/sqlite/repositories/HijriCalendarCacheRepository';
import { reminderSendTimeModes, type ReminderSettings } from '../../storage/sqlite/repositories/ReminderSettingsRepository';
import { logger } from '../../observability/logging/logger';
import { normalizeTimeZone, parseReminderTime } from '../../shared/time';
import type { PrayerName } from '../../shared/prayers';
import { fetchPrayerTiming as fetchPrayerTimingFromAlAdhan } from '../maqraah/reminders/prayerTimes';
import { subscriptionReminderEvents, type SubscriptionReminderEventDefinition } from './catalog';
import { getReminderChannel, isSendableTextChannel } from './channel';
import { addDaysToDateKey, formatLocalDateKey, getWeekdayFromDateKey, isSameLocalHourAndMinute } from './dateUtils';
import { buildSubscriptionReminderMessage } from './messages';
import { ensureCategoryRole } from './roleManager';
import { refreshHijriCalendarCache } from './calendarCache';

export let scheduledSubscriptionReminderJobs: cron.ScheduledTask[] = [];

interface CachedSubscriptionPrayerTime {
	key: string;
	minutesSinceMidnight: number;
}

let cachedSubscriptionPrayerTime: CachedSubscriptionPrayerTime | null = null;

export interface SubscriptionReminderSchedulerDependencies {
	getConfiguration?: typeof configurationRepository.getConfiguration;
	getSettings?: typeof reminderSettingsRepository.getSettings;
	getCachedHijriDate?: typeof hijriCalendarCacheRepository.getByGregorianDate;
	hasEvent?: typeof subscriptionReminderEventsRepository.hasEvent;
	recordEventSent?: typeof subscriptionReminderEventsRepository.recordEventSent;
	ensureCategoryRole?: typeof ensureCategoryRole;
	fetchPrayerTiming?: typeof fetchPrayerTimingFromAlAdhan;
}

export async function scheduleSubscriptionReminders(client: Client): Promise<void> {
	stopSubscriptionReminderJobs();

	const configuration = await configurationRepository.getConfiguration();
	const timezone = normalizeTimeZone(configuration.timezone);
	if (!timezone) {
		logger.warn(`Invalid timezone configured for subscription reminders: ${configuration.timezone}`, undefined, {
			operationType: 'subscription_reminder_schedule',
			operationStatus: 'failure',
			additionalData: { timezone: configuration.timezone },
		});
		return;
	}

	const settings = await reminderSettingsRepository.getSettings();
	const cronTime = getSubscriptionReminderCronTime(settings);
	if (!cronTime) {
		logger.warn(`Invalid subscription reminder send time configured: ${settings.sendTime}`, undefined, {
			operationType: 'subscription_reminder_schedule',
			operationStatus: 'failure',
			additionalData: { sendTime: settings.sendTime, sendTimeMode: settings.sendTimeMode, sendPrayer: settings.sendPrayer },
		});
		return;
	}

	await refreshHijriCalendarCache({ timezone });

	const sendJob = cron.schedule(
		cronTime,
		async () => {
			await executeSubscriptionReminderRun(client);
		},
		{ timezone }
	);

	const cacheRefreshJob = cron.schedule(
		'17 2 * * *',
		async () => {
			await refreshHijriCalendarCache({ timezone });
		},
		{ timezone }
	);

	scheduledSubscriptionReminderJobs.push(sendJob, cacheRefreshJob);
	logger.recordSchedulerEvent('scheduled', {
		cronTime,
		timezone,
		stage: 'subscription_reminders',
	});
}

export function stopSubscriptionReminderJobs(): void {
	for (const job of scheduledSubscriptionReminderJobs) {
		job.stop();
	}

	if (scheduledSubscriptionReminderJobs.length > 0) {
		logger.recordSchedulerEvent('stopped', { stage: 'subscription_reminders', count: scheduledSubscriptionReminderJobs.length });
	}

	scheduledSubscriptionReminderJobs = [];
}

export function clearSubscriptionReminderPrayerTimeCache(): void {
	cachedSubscriptionPrayerTime = null;
}

export async function executeSubscriptionReminderRun(
	client: any,
	now: Date = new Date(),
	dependencies: SubscriptionReminderSchedulerDependencies = {}
): Promise<void> {
	const getConfiguration = dependencies.getConfiguration ?? configurationRepository.getConfiguration.bind(configurationRepository);
	const getSettings = dependencies.getSettings ?? reminderSettingsRepository.getSettings.bind(reminderSettingsRepository);
	const getCachedHijriDate = dependencies.getCachedHijriDate ?? hijriCalendarCacheRepository.getByGregorianDate.bind(hijriCalendarCacheRepository);
	const hasEvent = dependencies.hasEvent ?? subscriptionReminderEventsRepository.hasEvent.bind(subscriptionReminderEventsRepository);
	const recordEventSent =
		dependencies.recordEventSent ?? subscriptionReminderEventsRepository.recordEventSent.bind(subscriptionReminderEventsRepository);
	const resolveCategoryRole = dependencies.ensureCategoryRole ?? ensureCategoryRole;
	const fetchPrayerTiming = dependencies.fetchPrayerTiming ?? fetchPrayerTimingFromAlAdhan;

	const configuration = await getConfiguration();
	const timezone = normalizeTimeZone(configuration.timezone);
	if (!timezone) {
		logger.warn(`Invalid timezone configured during subscription reminder run: ${configuration.timezone}`, undefined, {
			operationType: 'subscription_reminder_execution',
			operationStatus: 'failure',
			additionalData: { timezone: configuration.timezone },
		});
		return;
	}

	const settings = await getSettings();
	const sendMinutes = await resolveSubscriptionReminderSendMinutes(settings, configuration, timezone, now, fetchPrayerTiming);
	if (sendMinutes === null || !isSameLocalHourAndMinute(now, timezone, sendMinutes)) {
		return;
	}

	const channel = getReminderChannel(client, settings.channelId);
	if (!isSendableTextChannel(channel)) {
		logger.warn('Configured subscription reminder channel was not found or is not sendable', undefined, {
			operationType: 'subscription_reminder_execution',
			operationStatus: 'failure',
			additionalData: { channelId: settings.channelId },
		});
		return;
	}

	const guild = getConfiguredGuild(client);
	if (!guild) {
		logger.warn('Configured guild was not found for subscription reminders', undefined, {
			operationType: 'subscription_reminder_execution',
			operationStatus: 'failure',
			additionalData: { guildId: process.env.GUILD_ID },
		});
		return;
	}

	const sendDate = formatLocalDateKey(now, timezone);
	const dueEvents = await getDueSubscriptionReminderEventsForSendDate(sendDate, getCachedHijriDate);
	for (const { event, targetDate, hijriDate } of dueEvents) {
		const occurrenceKey = buildOccurrenceEventKey(event, targetDate);
		if (await hasEvent(occurrenceKey)) {
			continue;
		}

		try {
			const role = await resolveCategoryRole(guild, event.categoryKey, true);
			if (!role) {
				throw new Error(`Could not resolve reminder category role for ${event.categoryKey}.`);
			}

			await channel.send({
				content: buildSubscriptionReminderMessage({
					roleId: role.id,
					event,
					targetGregorianDate: targetDate,
					hijriDate,
				}),
				flags: MessageFlags.SuppressEmbeds,
				allowedMentions: { parse: [], roles: [role.id] },
			});

			await recordEventSent({
				eventKey: occurrenceKey,
				categoryKey: event.categoryKey,
				targetRoleId: role.id,
				scheduledFor: now.toISOString(),
				sentAt: new Date().toISOString(),
			});

			logger.recordSchedulerEvent('executed', {
				stage: 'subscription_reminders',
				eventKey: occurrenceKey,
				categoryKey: event.categoryKey,
				targetDate,
			});
		} catch (error) {
			logger.error('Failed to send subscription reminder', error as Error, undefined, {
				operationType: 'subscription_reminder_execution',
				operationStatus: 'failure',
				additionalData: { eventKey: occurrenceKey, categoryKey: event.categoryKey, targetDate },
			});
			logger.recordSchedulerEvent('failed', {
				stage: 'subscription_reminders',
				eventKey: occurrenceKey,
				categoryKey: event.categoryKey,
			});
		}
	}
}

function getSubscriptionReminderCronTime(settings: ReminderSettings): string | null {
	if (isPrayerSyncedSendTime(settings)) {
		return '* * * * *';
	}

	return parseReminderTime(settings.sendTime)?.cronTime ?? null;
}

async function resolveSubscriptionReminderSendMinutes(
	settings: ReminderSettings,
	configuration: Configuration,
	timezone: string,
	now: Date,
	fetchPrayerTiming: typeof fetchPrayerTimingFromAlAdhan
): Promise<number | null> {
	if (!isPrayerSyncedSendTime(settings)) {
		return parseReminderTime(settings.sendTime)?.minutesSinceMidnight ?? null;
	}

	return resolveSyncedPrayerSendMinutes(configuration, settings.sendPrayer, timezone, now, fetchPrayerTiming);
}

async function resolveSyncedPrayerSendMinutes(
	configuration: Configuration,
	prayer: PrayerName,
	timezone: string,
	now: Date,
	fetchPrayerTiming: typeof fetchPrayerTimingFromAlAdhan
): Promise<number | null> {
	const cacheKey = buildPrayerTimeCacheKey(configuration, prayer, timezone, now);
	if (cachedSubscriptionPrayerTime?.key === cacheKey) {
		return cachedSubscriptionPrayerTime.minutesSinceMidnight;
	}

	try {
		const timing = await fetchPrayerTiming(configuration, prayer, now);
		cachedSubscriptionPrayerTime = {
			key: cacheKey,
			minutesSinceMidnight: timing.minutesSinceMidnight,
		};
		return timing.minutesSinceMidnight;
	} catch (error) {
		logger.error('Failed to resolve subscription reminder prayer time', error as Error, undefined, {
			operationType: 'subscription_reminder_prayer_time',
			operationStatus: 'failure',
			additionalData: { prayer, timezone, date: formatLocalDateKey(now, timezone) },
		});
		return null;
	}
}

function isPrayerSyncedSendTime(settings: ReminderSettings): settings is ReminderSettings & { sendPrayer: PrayerName } {
	return settings.sendTimeMode === reminderSendTimeModes.PRAYER && settings.sendPrayer !== null;
}

function buildPrayerTimeCacheKey(configuration: Configuration, prayer: PrayerName, timezone: string, now: Date): string {
	return [
		formatLocalDateKey(now, timezone),
		timezone,
		prayer,
		configuration.maqraahTimeSyncLatitude,
		configuration.maqraahTimeSyncLongitude,
		configuration.maqraahTimeSyncCalculationMethod,
	].join('|');
}

interface DueSubscriptionReminderEvent {
	event: SubscriptionReminderEventDefinition;
	targetDate: string;
	hijriDate: HijriCalendarCacheEntry | null;
}

async function getDueSubscriptionReminderEventsForSendDate(
	sendDate: string,
	getCachedHijriDate: typeof hijriCalendarCacheRepository.getByGregorianDate
): Promise<DueSubscriptionReminderEvent[]> {
	const dueEvents: DueSubscriptionReminderEvent[] = [];
	const hijriDateCache = new Map<string, HijriCalendarCacheEntry | null>();
	const missingHijriWarnings = new Set<string>();

	for (const event of subscriptionReminderEvents) {
		const targetDate = addDaysToDateKey(sendDate, event.leadDays);

		if (event.matcher.type === 'gregorian-weekday') {
			if (event.matcher.weekday === getWeekdayFromDateKey(targetDate)) {
				dueEvents.push({ event, targetDate, hijriDate: null });
			}

			continue;
		}

		let hijriDate = hijriDateCache.get(targetDate);
		if (hijriDate === undefined) {
			hijriDate = await getCachedHijriDate(targetDate);
			hijriDateCache.set(targetDate, hijriDate);
		}

		if (!hijriDate) {
			if (!missingHijriWarnings.has(targetDate)) {
				logger.warn('No cached Hijri calendar date available; skipping Hijri-based subscription reminders', undefined, {
					operationType: 'subscription_reminder_execution',
					operationStatus: 'partial',
					additionalData: { targetDate },
				});
				missingHijriWarnings.add(targetDate);
			}

			continue;
		}

		const monthMatches = event.matcher.month === 0 || event.matcher.month === hijriDate.hijriMonth;
		if (monthMatches && event.matcher.days.includes(hijriDate.hijriDay)) {
			dueEvents.push({ event, targetDate, hijriDate });
		}
	}

	return dueEvents;
}

export function getDueSubscriptionReminderEvents(
	targetDate: string,
	hijriDate: HijriCalendarCacheEntry | null
): SubscriptionReminderEventDefinition[] {
	const weekday = getWeekdayFromDateKey(targetDate);

	return subscriptionReminderEvents.filter((event) => {
		if (event.matcher.type === 'gregorian-weekday') {
			return event.matcher.weekday === weekday;
		}

		if (!hijriDate) {
			return false;
		}

		const monthMatches = event.matcher.month === 0 || event.matcher.month === hijriDate.hijriMonth;
		return monthMatches && event.matcher.days.includes(hijriDate.hijriDay);
	});
}

function buildOccurrenceEventKey(event: SubscriptionReminderEventDefinition, targetDate: string): string {
	return `${event.key}:${targetDate}:days-before-${event.leadDays}`;
}

function getConfiguredGuild(client: any): any | null {
	const guildId = process.env.GUILD_ID;
	if (!guildId) {
		return null;
	}

	return client?.guilds?.cache?.get(guildId) ?? null;
}
