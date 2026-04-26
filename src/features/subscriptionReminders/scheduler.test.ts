import assert from 'node:assert/strict';
import test from 'node:test';
import type { HijriCalendarCacheEntry } from '../../storage/sqlite/repositories/HijriCalendarCacheRepository';
import type { ReminderSettings } from '../../storage/sqlite/repositories/ReminderSettingsRepository';

process.env.DATABASE_PATH ??= ':memory:';
process.env.GUILD_ID = 'guild-1';

const { executeSubscriptionReminderRun } = require('./scheduler') as typeof import('./scheduler');

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
		updatedAt: '2026-04-20T12:00:00.000Z',
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
