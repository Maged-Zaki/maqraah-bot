import assert from 'node:assert/strict';
import test from 'node:test';
import type { HijriCalendarCacheEntry } from '../../storage/sqlite/repositories/HijriCalendarCacheRepository';
import type { ReminderSettings } from '../../storage/sqlite/repositories/ReminderSettingsRepository';

process.env.DATABASE_PATH ??= ':memory:';
process.env.GUILD_ID = 'guild-1';

const { reminderSendTimeModes } = require('../../storage/sqlite/repositories/ReminderSettingsRepository') as typeof import('../../storage/sqlite/repositories/ReminderSettingsRepository');
const { clearSubscriptionReminderPrayerTimeCache, executeSubscriptionReminderRun } = require('./scheduler') as typeof import('./scheduler');

test('scheduler sends reminders at the configured time', async () => {
	const sentPayloads: any[] = [];

	await executeSubscriptionReminderRun(createClient(sentPayloads), new Date('2026-04-19T18:00:00.000Z'), {
		getConfiguration: async () => ({ timezone: 'UTC' } as any),
		getSettings: async () => buildSettings({ sendTime: '6:00 PM' }),
		getCachedHijriDate: async () => null,
		hasEvent: async () => false,
		recordEventSent: async () => true,
		ensureCategoryRole: async () => ({ id: 'role-fasting', name: 'تذكيرات الصيام' }),
	});

	assert.equal(sentPayloads.length, 1);
	assert.match(sentPayloads[0].content, /<@&role-fasting>/);
	assert.match(sentPayloads[0].content, /صيام يوم الاثنين/);
	assert.match(sentPayloads[0].content, /الحديث:/);
	assert.match(sentPayloads[0].content, /جامع الترمذي 747/);
	assert.doesNotMatch(sentPayloads[0].content, /الموعد/);
	assert.deepEqual(sentPayloads[0].allowedMentions, { parse: [], roles: ['role-fasting'] });
});

test('scheduler skips runs outside the configured time', async () => {
	const sentPayloads: any[] = [];

	await executeSubscriptionReminderRun(createClient(sentPayloads), new Date('2026-04-19T17:59:00.000Z'), {
		getConfiguration: async () => ({ timezone: 'UTC' } as any),
		getSettings: async () => buildSettings({ sendTime: '6:00 PM' }),
		getCachedHijriDate: async () => null,
		hasEvent: async () => false,
		recordEventSent: async () => true,
		ensureCategoryRole: async () => ({ id: 'role-fasting', name: 'تذكيرات الصيام' }),
	});

	assert.equal(sentPayloads.length, 0);
});

test('scheduler sends prayer-synced reminders at the exact prayer minute', async () => {
	clearSubscriptionReminderPrayerTimeCache();
	const sentPayloads: any[] = [];
	const requestedPrayers: string[] = [];

	await executeSubscriptionReminderRun(createClient(sentPayloads), new Date('2026-04-19T20:17:00.000Z'), {
		getConfiguration: async () => buildConfiguration({ timezone: 'UTC' }),
		getSettings: async () => buildSettings({ sendTimeMode: reminderSendTimeModes.PRAYER, sendPrayer: 'isha' }),
		getCachedHijriDate: async () => null,
		hasEvent: async () => false,
		recordEventSent: async () => true,
		ensureCategoryRole: async () => ({ id: 'role-fasting', name: 'تذكيرات الصيام' }),
		fetchPrayerTiming: async (_configuration, prayer) => {
			requestedPrayers.push(prayer);
			return buildPrayerTiming({ prayer, rawPrayerTime: '20:17', prayerTime: '8:17 PM', minutesSinceMidnight: 20 * 60 + 17 });
		},
	});

	assert.deepEqual(requestedPrayers, ['isha']);
	assert.equal(sentPayloads.length, 1);
	assert.match(sentPayloads[0].content, /صيام يوم الاثنين/);
});

test('scheduler skips prayer-synced runs outside the exact prayer minute without rounding', async () => {
	clearSubscriptionReminderPrayerTimeCache();
	const sentPayloads: any[] = [];

	await executeSubscriptionReminderRun(createClient(sentPayloads), new Date('2026-04-19T20:16:00.000Z'), {
		getConfiguration: async () => buildConfiguration({ timezone: 'UTC' }),
		getSettings: async () => buildSettings({ sendTimeMode: reminderSendTimeModes.PRAYER, sendPrayer: 'isha' }),
		getCachedHijriDate: async () => null,
		hasEvent: async () => false,
		recordEventSent: async () => true,
		ensureCategoryRole: async () => ({ id: 'role-fasting', name: 'تذكيرات الصيام' }),
		fetchPrayerTiming: async (_configuration, prayer) =>
			buildPrayerTiming({ prayer, rawPrayerTime: '20:17', prayerTime: '8:17 PM', minutesSinceMidnight: 20 * 60 + 17 }),
	});

	assert.equal(sentPayloads.length, 0);
});

test('scheduler skips prayer-synced reminders when the prayer time cannot be resolved', async () => {
	clearSubscriptionReminderPrayerTimeCache();
	const sentPayloads: any[] = [];

	await executeSubscriptionReminderRun(createClient(sentPayloads), new Date('2026-04-19T03:00:00.000Z'), {
		getConfiguration: async () => buildConfiguration({ timezone: 'UTC' }),
		getSettings: async () => buildSettings({ sendTimeMode: reminderSendTimeModes.PRAYER, sendPrayer: 'fajr' }),
		getCachedHijriDate: async () => null,
		hasEvent: async () => false,
		recordEventSent: async () => true,
		ensureCategoryRole: async () => ({ id: 'role-fasting', name: 'تذكيرات الصيام' }),
		fetchPrayerTiming: async () => {
			throw new Error('AlAdhan is unavailable');
		},
	});

	assert.equal(sentPayloads.length, 0);
});

test('scheduler keeps fixed-time behavior when prayer sync is not enabled', async () => {
	clearSubscriptionReminderPrayerTimeCache();
	const sentPayloads: any[] = [];
	let prayerLookups = 0;

	await executeSubscriptionReminderRun(createClient(sentPayloads), new Date('2026-04-19T18:00:00.000Z'), {
		getConfiguration: async () => buildConfiguration({ timezone: 'UTC' }),
		getSettings: async () => buildSettings({ sendTimeMode: reminderSendTimeModes.FIXED, sendTime: '6:00 PM' }),
		getCachedHijriDate: async () => null,
		hasEvent: async () => false,
		recordEventSent: async () => true,
		ensureCategoryRole: async () => ({ id: 'role-fasting', name: 'تذكيرات الصيام' }),
		fetchPrayerTiming: async () => {
			prayerLookups += 1;
			throw new Error('should not look up prayer time');
		},
	});

	assert.equal(prayerLookups, 0);
	assert.equal(sentPayloads.length, 1);
});

test('scheduler ignores the legacy days-before value and uses hard-coded event lead days', async () => {
	const sentPayloads: any[] = [];

	await executeSubscriptionReminderRun(createClient(sentPayloads), new Date('2026-04-19T18:00:00.000Z'), {
		getConfiguration: async () => ({ timezone: 'UTC' } as any),
		getSettings: async () => buildSettings({ daysBefore: 0, sendTime: '6:00 PM' }),
		getCachedHijriDate: async () => null,
		hasEvent: async () => false,
		recordEventSent: async () => true,
		ensureCategoryRole: async () => ({ id: 'role-fasting', name: 'تذكيرات الصيام' }),
	});

	assert.equal(sentPayloads.length, 1);
	assert.match(sentPayloads[0].content, /غدا صيام يوم الاثنين/);
});

test('scheduler does not resend an already recorded reminder', async () => {
	const sentPayloads: any[] = [];

	await executeSubscriptionReminderRun(createClient(sentPayloads), new Date('2026-04-19T18:00:00.000Z'), {
		getConfiguration: async () => ({ timezone: 'UTC' } as any),
		getSettings: async () => buildSettings({ sendTime: '6:00 PM' }),
		getCachedHijriDate: async () => null,
		hasEvent: async () => true,
		recordEventSent: async () => {
			throw new Error('should not record');
		},
		ensureCategoryRole: async () => ({ id: 'role-fasting', name: 'تذكيرات الصيام' }),
	});

	assert.equal(sentPayloads.length, 0);
});

test('scheduler sends the six Shawwal reminder once on Eid day for fasting from tomorrow', async () => {
	const sentPayloads: any[] = [];
	const recordedEvents: string[] = [];
	const cachedDateLookups: string[] = [];

	await executeSubscriptionReminderRun(createClient(sentPayloads), new Date('2026-04-20T18:00:00.000Z'), {
		getConfiguration: async () => ({ timezone: 'UTC' } as any),
		getSettings: async () => buildSettings({ daysBefore: 0, sendTime: '6:00 PM' }),
		getCachedHijriDate: async (dateKey) => {
			cachedDateLookups.push(dateKey);
			return buildHijriDate({ gregorianDate: dateKey, hijriMonth: 10, hijriDay: 2, hijriMonthNameAr: 'شوال' });
		},
		hasEvent: async () => false,
		recordEventSent: async (event) => {
			recordedEvents.push(event.eventKey);
			return true;
		},
		ensureCategoryRole: async () => ({ id: 'role-fasting', name: 'تذكيرات الصيام' }),
	});

	assert.equal(sentPayloads.length, 1);
	assert.match(sentPayloads[0].content, /الست من شوال/);
	assert.match(sentPayloads[0].content, /من غد/);
	assert.match(sentPayloads[0].content, /صحيح مسلم 1164a/);
	assert.deepEqual(cachedDateLookups, ['2026-04-21']);
	assert.deepEqual(recordedEvents, ['six-shawwal:2026-04-21:days-before-1']);
});

test('scheduler skips Hijri-based reminders when provider and cache data are unavailable', async () => {
	const sentPayloads: any[] = [];

	await executeSubscriptionReminderRun(createClient(sentPayloads), new Date('2026-04-20T18:00:00.000Z'), {
		getConfiguration: async () => ({ timezone: 'UTC' } as any),
		getSettings: async () => buildSettings({ sendTime: '6:00 PM' }),
		getCachedHijriDate: async () => null,
		hasEvent: async () => false,
		recordEventSent: async () => true,
		ensureCategoryRole: async () => ({ id: 'role-fasting', name: 'تذكيرات الصيام' }),
	});

	assert.equal(sentPayloads.length, 0);
});

test('scheduler recovers missing category roles before sending', async () => {
	const sentPayloads: any[] = [];
	const ensuredCategories: string[] = [];

	await executeSubscriptionReminderRun(createClient(sentPayloads), new Date('2026-04-19T18:00:00.000Z'), {
		getConfiguration: async () => ({ timezone: 'UTC' } as any),
		getSettings: async () => buildSettings({ sendTime: '6:00 PM' }),
		getCachedHijriDate: async () => null,
		hasEvent: async () => false,
		recordEventSent: async () => true,
		ensureCategoryRole: async (_guild, categoryKey) => {
			ensuredCategories.push(categoryKey);
			return { id: 'recovered-role', name: 'تذكيرات الصيام' };
		},
	});

	assert.deepEqual(ensuredCategories, ['fasting']);
	assert.match(sentPayloads[0].content, /<@&recovered-role>/);
});

function createClient(sentPayloads: any[]) {
	return {
		channels: {
			cache: new Map([
				[
					'reminder-channel',
					{
						isTextBased: () => true,
						send: async (payload: any) => {
							sentPayloads.push(payload);
						},
					},
				],
			]),
		},
		guilds: {
			cache: new Map([['guild-1', { id: 'guild-1' }]]),
		},
	};
}

function buildSettings(overrides: Partial<ReminderSettings> = {}): ReminderSettings {
	return {
		id: 1,
		channelId: 'reminder-channel',
		daysBefore: 1,
		sendTime: '6:00 PM',
		sendTimeMode: reminderSendTimeModes.FIXED,
		sendPrayer: null,
		updatedAt: '2026-04-20T12:00:00.000Z',
		...overrides,
	};
}

function buildConfiguration(overrides: any = {}) {
	return {
		timezone: 'UTC',
		maqraahTimeSyncLatitude: 30.0444,
		maqraahTimeSyncLongitude: 31.2357,
		maqraahTimeSyncCalculationMethod: 5,
		...overrides,
	};
}

function buildPrayerTiming(overrides: any = {}) {
	return {
		date: '19-04-2026',
		prayer: 'isha',
		rawPrayerTime: '20:17',
		prayerTime: '8:17 PM',
		minutesSinceMidnight: 20 * 60 + 17,
		...overrides,
	};
}

function buildHijriDate(overrides: Partial<HijriCalendarCacheEntry> = {}): HijriCalendarCacheEntry {
	return {
		gregorianDate: '2026-04-21',
		hijriYear: 1447,
		hijriMonth: 10,
		hijriDay: 2,
		hijriMonthNameAr: 'شوال',
		hijriMonthNameEn: 'Shawwal',
		provider: 'fake',
		fetchedAt: '2026-04-20T12:00:00.000Z',
		...overrides,
	};
}
