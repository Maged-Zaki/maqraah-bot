import assert from 'node:assert/strict';
import test from 'node:test';
import { ApplicationCommandOptionType } from 'discord.js';
import type { Configuration } from '../../storage/sqlite/repositories/ConfigurationRepository';

process.env.DATABASE_PATH ??= ':memory:';

const { configurationRepository } = require('../../storage/sqlite') as typeof import('../../storage/sqlite');
const { data: maqraahCommandData } = require('../maqraah/command') as typeof import('../maqraah/command');
const { handleMaqraahConfigurationCommand } = require('./configurationCommand') as typeof import('./configurationCommand');

test('maqraah command exposes a configuration subcommand group with update and show', () => {
	const command = maqraahCommandData.toJSON() as any;
	const group = command.options.find((option: any) => option.name === 'configuration');
	assert.equal(group.type, ApplicationCommandOptionType.SubcommandGroup);
	assert.deepEqual(
		group.options.map((option: any) => option.name),
		['update', 'show']
	);
});

test('maqraah configuration update exposes the expected options', () => {
	const command = maqraahCommandData.toJSON() as any;
	const group = command.options.find((option: any) => option.name === 'configuration');
	const update = group.options.find((option: any) => option.name === 'update');
	const optionNames = update.options.map((option: any) => option.name);
	assert.ok(optionNames.includes('role'));
	assert.ok(optionNames.includes('voicechannel'));
	assert.ok(optionNames.includes('maqraah-time'));
	assert.ok(optionNames.includes('maqraah-time-sync-prayer'));
	assert.ok(optionNames.includes('maqraah-minutes-after-prayer'));
});

test('maqraah configuration update rejects an invalid maqraah time', { concurrency: false }, async () => {
	const replies: any[] = [];
	const originalGet = configurationRepository.getConfiguration;
	configurationRepository.getConfiguration = async () => buildConfiguration();

	try {
		await handleMaqraahConfigurationCommand(
			buildInteraction({ subcommand: 'update', stringOptions: { 'maqraah-time': 'not a time' }, replies })
		);
		assert.equal(replies.length, 1);
		assert.match(replies[0].content, /Invalid maqraah time/);
	} finally {
		configurationRepository.getConfiguration = originalGet;
	}
});

test('maqraah configuration update with no options replies accordingly', { concurrency: false }, async () => {
	const replies: any[] = [];
	const originalGet = configurationRepository.getConfiguration;
	configurationRepository.getConfiguration = async () => buildConfiguration();

	try {
		await handleMaqraahConfigurationCommand(buildInteraction({ subcommand: 'update', replies }));
		assert.equal(replies.length, 1);
		assert.match(replies[0].content, /No options provided/);
	} finally {
		configurationRepository.getConfiguration = originalGet;
	}
});

test('maqraah configuration show renders the maqraah settings embed', { concurrency: false }, async () => {
	const replies: any[] = [];
	const originalGet = configurationRepository.getConfiguration;
	configurationRepository.getConfiguration = async () => buildConfiguration({ dailyTime: '8:00 PM', roleId: 'role-1', maqraahTimeSyncEnabled: 1, maqraahTimeSyncPrayer: 'maghrib' });

	try {
		await handleMaqraahConfigurationCommand(buildInteraction({ subcommand: 'show', replies }));
		assert.equal(replies.length, 1);
		assert.equal(replies[0].embeds.length, 1);
		const fields = Object.fromEntries(replies[0].embeds[0].data.fields.map((f: any) => [f.name, f.value]));
		assert.equal(fields['Reminder Time'], '8:00 PM');
		assert.match(fields['Maqraah time sync'], /Enabled.*maghrib/);
	} finally {
		configurationRepository.getConfiguration = originalGet;
	}
});

test('maqraah configuration update persists time-sync options at once', { concurrency: false }, async () => {
	const replies: any[] = [];
	const updates: any[] = [];
	const originalGet = configurationRepository.getConfiguration;
	const originalUpdate = configurationRepository.updateConfiguration;
	// time sync disabled so scheduleMaqraahTimeSync short-circuits and no reminder reschedule happens.
	configurationRepository.getConfiguration = async () => buildConfiguration({ maqraahTimeSyncEnabled: 0 });
	configurationRepository.updateConfiguration = async (payload: any) => {
		updates.push(payload);
	};

	try {
		await handleMaqraahConfigurationCommand(
			buildInteraction({
				subcommand: 'update',
				replies,
				stringOptions: { 'maqraah-time-sync-prayer': 'isha' },
				integerOptions: { 'maqraah-minutes-after-prayer': 45 },
				booleanOptions: { 'maqraah-time-sync-enabled': false },
			})
		);
		assert.equal(updates.length, 1);
		assert.deepEqual(updates[0], {
			maqraahTimeSyncPrayer: 'isha',
			maqraahTimeSyncOffsetMinutes: 45,
			maqraahTimeSyncEnabled: 0,
		});
		assert.match(String(replies[0]), /Maqraah time sync prayer set to `isha`/);
	} finally {
		configurationRepository.getConfiguration = originalGet;
		configurationRepository.updateConfiguration = originalUpdate;
	}
});

function buildInteraction(options: {
	subcommand: string;
	replies: any[];
	stringOptions?: Record<string, string | null>;
	booleanOptions?: Record<string, boolean | null>;
	integerOptions?: Record<string, number | null>;
}): any {
	return {
		options: {
			getSubcommand: () => options.subcommand,
			getString: (name: string) => options.stringOptions?.[name] ?? null,
			getBoolean: (name: string) => (options.booleanOptions?.[name] === undefined ? null : options.booleanOptions?.[name] ?? null),
			getRole: () => null,
			getChannel: () => null,
			getInteger: (name: string) => (options.integerOptions?.[name] === undefined ? null : options.integerOptions?.[name] ?? null),
		},
		user: { id: 'user-1', username: 'User One' },
		guildId: 'guild-1',
		channelId: 'channel-1',
		client: {},
		reply: async (payload: any) => {
			options.replies.push(payload);
		},
	};
}

function buildConfiguration(config: Partial<Configuration> = {}): Configuration {
	return {
		roleId: 'role-id',
		dailyTime: '1:00 PM',
		timezone: 'Africa/Cairo',
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
		maqraahTimeSyncPrayer: 'maghrib',
		...config,
	};
}
