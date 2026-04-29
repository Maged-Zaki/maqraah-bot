import assert from 'node:assert/strict';
import test from 'node:test';
import sqlite3 from 'sqlite3';
import {
	ReminderSettingsRepository,
	reminderSendTimeModes,
	subscriptionReminderSettingsDefaults,
} from './ReminderSettingsRepository';

test('reminder settings default to fixed time mode', async () => {
	const { db, repository } = await createRepository();

	try {
		const settings = await repository.getSettings('default-channel');

		assert.equal(settings.channelId, 'default-channel');
		assert.equal(settings.sendTime, subscriptionReminderSettingsDefaults.sendTime);
		assert.equal(settings.sendTimeMode, reminderSendTimeModes.FIXED);
		assert.equal(settings.sendPrayer, null);
	} finally {
		await close(db);
	}
});

test('switching to prayer mode preserves the previous fixed time', async () => {
	const { db, repository } = await createRepository();

	try {
		await repository.updateSettings({ sendTime: '8:05 PM' });
		const settings = await repository.updateSettings({
			sendTimeMode: reminderSendTimeModes.PRAYER,
			sendPrayer: 'isha',
		});

		assert.equal(settings.sendTime, '8:05 PM');
		assert.equal(settings.sendTimeMode, reminderSendTimeModes.PRAYER);
		assert.equal(settings.sendPrayer, 'isha');
	} finally {
		await close(db);
	}
});

test('switching back to fixed time clears the synced prayer', async () => {
	const { db, repository } = await createRepository();

	try {
		await repository.updateSettings({
			sendTimeMode: reminderSendTimeModes.PRAYER,
			sendPrayer: 'dhuhr',
		});
		const settings = await repository.updateSettings({
			sendTime: '7:10 PM',
			sendTimeMode: reminderSendTimeModes.FIXED,
			sendPrayer: null,
		});

		assert.equal(settings.sendTime, '7:10 PM');
		assert.equal(settings.sendTimeMode, reminderSendTimeModes.FIXED);
		assert.equal(settings.sendPrayer, null);
	} finally {
		await close(db);
	}
});

async function createRepository(): Promise<{ db: sqlite3.Database; repository: ReminderSettingsRepository }> {
	const db = new sqlite3.Database(':memory:');
	await run(
		db,
		`
			CREATE TABLE reminder_settings (
				id INTEGER PRIMARY KEY DEFAULT 1,
				channelId TEXT NOT NULL DEFAULT '',
				daysBefore INTEGER NOT NULL DEFAULT ${subscriptionReminderSettingsDefaults.daysBefore},
				sendTime TEXT NOT NULL DEFAULT '${subscriptionReminderSettingsDefaults.sendTime}',
				sendTimeMode TEXT NOT NULL DEFAULT '${subscriptionReminderSettingsDefaults.sendTimeMode}',
				sendPrayer TEXT,
				updatedAt TEXT NOT NULL
			)
		`
	);

	return { db, repository: new ReminderSettingsRepository(db) };
}

function run(db: sqlite3.Database, sql: string): Promise<void> {
	return new Promise((resolve, reject) => {
		db.run(sql, (err) => {
			if (err) {
				reject(err);
			} else {
				resolve();
			}
		});
	});
}

function close(db: sqlite3.Database): Promise<void> {
	return new Promise((resolve, reject) => {
		db.close((err) => {
			if (err) {
				reject(err);
			} else {
				resolve();
			}
		});
	});
}
