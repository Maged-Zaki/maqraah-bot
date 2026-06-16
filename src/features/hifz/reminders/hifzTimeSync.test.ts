import assert from 'node:assert/strict';
import test from 'node:test';
import type { Configuration } from '../../../storage/sqlite/repositories/ConfigurationRepository';

process.env.DATABASE_PATH ??= ':memory:';

const { configurationRepository } = require('../../../storage/sqlite') as typeof import('../../../storage/sqlite');
const {
	resolveHifzTimeSyncPrayer,
	isHifzEnabled,
	scheduleHifzTimeSync,
	stopHifzTimeSync,
	syncHifzTimeFromPrayer,
	DEFAULT_HIFZ_TIME_SYNC_PRAYER,
	DEFAULT_HIFZ_TIME_SYNC_OFFSET_MINUTES,
} = require('./hifzTimeSync') as typeof import('./hifzTimeSync');

function getHifzTimeSyncJob() {
	return (require('./hifzTimeSync') as typeof import('./hifzTimeSync')).hifzTimeSyncJob;
}

test('hifz time sync prayer defaults to dhuhr', () => {
	assert.equal(resolveHifzTimeSyncPrayer(undefined), DEFAULT_HIFZ_TIME_SYNC_PRAYER);
	assert.equal(resolveHifzTimeSyncPrayer('maghrib'), 'maghrib');
	assert.equal(resolveHifzTimeSyncPrayer('not-a-prayer'), DEFAULT_HIFZ_TIME_SYNC_PRAYER);
});

test('hifz time sync offset default is 90 minutes', () => {
	assert.equal(DEFAULT_HIFZ_TIME_SYNC_OFFSET_MINUTES, 90);
});

test('isHifzEnabled defaults to true and respects disabling', () => {
	assert.equal(isHifzEnabled(buildConfig({ hifzEnabled: undefined })), true);
	assert.equal(isHifzEnabled(buildConfig({ hifzEnabled: 1 })), true);
	assert.equal(isHifzEnabled(buildConfig({ hifzEnabled: 0 })), false);
	assert.equal(isHifzEnabled(buildConfig({ hifzEnabled: false })), false);
});

test('scheduleHifzTimeSync skips scheduling when hifz is disabled', { concurrency: false }, async () => {
	const originalGet = configurationRepository.getConfiguration;
	configurationRepository.getConfiguration = async () => buildConfig({ hifzEnabled: 0 });

	try {
		await scheduleHifzTimeSync(stubClient(), false);
		assert.equal(getHifzTimeSyncJob(), null);
	} finally {
		configurationRepository.getConfiguration = originalGet;
		stopHifzTimeSync();
	}
});

test('scheduleHifzTimeSync skips scheduling when time sync is disabled', { concurrency: false }, async () => {
	const originalGet = configurationRepository.getConfiguration;
	configurationRepository.getConfiguration = async () => buildConfig({ hifzTimeSyncEnabled: 0 });

	try {
		await scheduleHifzTimeSync(stubClient(), false);
		assert.equal(getHifzTimeSyncJob(), null);
	} finally {
		configurationRepository.getConfiguration = originalGet;
		stopHifzTimeSync();
	}
});

test('scheduleHifzTimeSync creates a job when fully enabled', { concurrency: false }, async () => {
	const originalGet = configurationRepository.getConfiguration;
	configurationRepository.getConfiguration = async () => buildConfig({ hifzEnabled: 1, hifzTimeSyncEnabled: 1, timezone: 'UTC' });

	try {
		await scheduleHifzTimeSync(stubClient(), false);
		assert.notEqual(getHifzTimeSyncJob(), null);
	} finally {
		configurationRepository.getConfiguration = originalGet;
		stopHifzTimeSync();
	}
});

test('syncHifzTimeFromPrayer updates hifzTime when the synced time differs', { concurrency: false }, async () => {
	const originalGet = configurationRepository.getConfiguration;
	const originalUpdate = configurationRepository.updateConfiguration;
	const updates: any[] = [];
	configurationRepository.getConfiguration = async () => buildConfig({ hifzEnabled: 1, hifzTimeSyncEnabled: 1, hifzTime: '6:00 PM', hifzTimeSyncPrayer: 'dhuhr', hifzTimeSyncOffsetMinutes: 90, timezone: 'UTC' });
	configurationRepository.updateConfiguration = async (payload: any) => {
		updates.push(payload);
	};

	try {
		const result = await syncHifzTimeFromPrayer(stubClient(), { reschedule: false, announceChange: false, fetchImplementation: mockAlAdhanFetch });
		assert.equal(result.enabled, true);
		assert.equal(result.changed, true);
		assert.equal(result.reminderTime, '2:00 PM');
		assert.deepEqual(updates, [{ hifzTime: '2:00 PM' }]);
	} finally {
		configurationRepository.getConfiguration = originalGet;
		configurationRepository.updateConfiguration = originalUpdate;
	}
});

test('syncHifzTimeFromPrayer reports no change when the synced time matches', { concurrency: false }, async () => {
	const originalGet = configurationRepository.getConfiguration;
	const originalUpdate = configurationRepository.updateConfiguration;
	let updateCalled = false;
	// Dhuhr 12:30 -> rounded 12:30 -> +90 = 2:00 PM; set current hifzTime to 2:00 PM so it is "already synced".
	configurationRepository.getConfiguration = async () => buildConfig({ hifzEnabled: 1, hifzTimeSyncEnabled: 1, hifzTime: '2:00 PM', hifzTimeSyncPrayer: 'dhuhr', hifzTimeSyncOffsetMinutes: 90, timezone: 'UTC' });
	configurationRepository.updateConfiguration = async () => {
		updateCalled = true;
	};

	try {
		const result = await syncHifzTimeFromPrayer(stubClient(), { reschedule: false, announceChange: false, fetchImplementation: mockAlAdhanFetch });
		assert.equal(result.changed, false);
		assert.equal(updateCalled, false);
	} finally {
		configurationRepository.getConfiguration = originalGet;
		configurationRepository.updateConfiguration = originalUpdate;
	}
});

test('syncHifzTimeFromPrayer announces and reschedules when it changes', { concurrency: false }, async () => {
	const previousChannelId = process.env.CHANNEL_ID;
	process.env.CHANNEL_ID = 'channel-1';
	const originalGet = configurationRepository.getConfiguration;
	const originalUpdate = configurationRepository.updateConfiguration;
	configurationRepository.getConfiguration = async () => buildConfig({ hifzEnabled: 1, hifzTimeSyncEnabled: 1, hifzTime: '6:00 PM', hifzTimeSyncPrayer: 'dhuhr', hifzTimeSyncOffsetMinutes: 90, timezone: 'UTC', roleId: 'hifz-role' });
	configurationRepository.updateConfiguration = async () => {};

	const client = stubClient();
	const sent: string[] = [];
	(client as any).channels.cache.set('channel-1', {
		send: async (payload: any) => {
			sent.push(payload);
		},
		isSendable: () => true,
	});

	try {
		const result = await syncHifzTimeFromPrayer(client, { reschedule: false, announceChange: true, fetchImplementation: mockAlAdhanFetch });
		assert.equal(result.changed, true);
		assert.equal(sent.length, 1);
		assert.match(sent[0], /Hifz Time has been changed to `2:00 PM`/);
	} finally {
		configurationRepository.getConfiguration = originalGet;
		configurationRepository.updateConfiguration = originalUpdate;
		if (previousChannelId === undefined) {
			delete process.env.CHANNEL_ID;
		} else {
			process.env.CHANNEL_ID = previousChannelId;
		}
	}
});

test('syncHifzTimeFromPrayer is a no-op when hifz is disabled', { concurrency: false }, async () => {
	const originalGet = configurationRepository.getConfiguration;
	configurationRepository.getConfiguration = async () => buildConfig({ hifzEnabled: 0, hifzTimeSyncEnabled: 1 });

	try {
		const result = await syncHifzTimeFromPrayer(stubClient(), { fetchImplementation: mockAlAdhanFetch });
		assert.equal(result.enabled, false);
		assert.equal(result.changed, false);
	} finally {
		configurationRepository.getConfiguration = originalGet;
	}
});

function mockAlAdhanFetch(): Promise<any> {
	return Promise.resolve({
		ok: true,
		json: async () => ({
			code: 200,
			status: 'OK',
			data: { timings: { Fajr: '04:00', Sunrise: '05:30', Dhuhr: '12:30', Asr: '15:45', Maghrib: '18:00', Isha: '19:30' } },
		}),
	});
}

function stubClient(): any {
	return { channels: { cache: new Map() } };
}

function buildConfig(config: Partial<Configuration>): Configuration {
	return {
		roleId: 'role-id',
		dailyTime: '1:00 PM',
		timezone: 'UTC',
		voiceChannelId: '',
		preReminderEnabled: 1,
		preReminderOffsetMinutes: 5,
		mainReminderEnabled: 1,
		maqraahTimeSyncEnabled: 0,
		maqraahTimeSyncOffsetMinutes: 30,
		maqraahTimeSyncLatitude: 30.0444,
		maqraahTimeSyncLongitude: 31.2357,
		maqraahTimeSyncCalculationMethod: 5,
		welcomeSentAt: null,
		hifzEnabled: 1,
		hifzRoleId: 'role-id',
		hifzTime: '6:00 PM',
		hifzReminderEnabled: 1,
		hifzPreReminderEnabled: 1,
		hifzPreReminderOffsetMinutes: 5,
		hifzTimeSyncEnabled: 1,
		hifzTimeSyncPrayer: 'dhuhr',
		hifzTimeSyncOffsetMinutes: 90,
		maqraahTimeSyncPrayer: 'maghrib',
		...config,
	};
}
