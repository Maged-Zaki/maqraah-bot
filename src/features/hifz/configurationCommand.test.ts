import assert from 'node:assert/strict';
import test from 'node:test';
import { ApplicationCommandOptionType } from 'discord.js';
import type { Configuration } from '../../storage/sqlite/repositories/ConfigurationRepository';

process.env.DATABASE_PATH ??= ':memory:';

const { configurationRepository } = require('../../storage/sqlite') as typeof import('../../storage/sqlite');
const { data: hifzCommandData } = require('../hifz/command') as typeof import('../hifz/command');
const { handleHifzConfigurationCommand } = require('./configurationCommand') as typeof import('./configurationCommand');

test('hifz command exposes a configuration subcommand group with update and show', () => {
	const command = hifzCommandData.toJSON() as any;
	const group = command.options.find((option: any) => option.name === 'configuration');
	assert.equal(group.type, ApplicationCommandOptionType.SubcommandGroup);
	assert.deepEqual(
		group.options.map((option: any) => option.name),
		['update', 'show']
	);
});

test('hifz configuration update exposes the expected options including the master toggle', () => {
	const command = hifzCommandData.toJSON() as any;
	const group = command.options.find((option: any) => option.name === 'configuration');
	const update = group.options.find((option: any) => option.name === 'update');
	const optionNames = update.options.map((option: any) => option.name);
	assert.ok(optionNames.includes('hifz-enabled'));
	assert.ok(optionNames.includes('hifz-role'));
	assert.ok(optionNames.includes('hifz-time'));
	assert.ok(optionNames.includes('hifz-days'));
	assert.ok(optionNames.includes('hifz-time-sync-prayer'));
	assert.ok(optionNames.includes('hifz-minutes-after-prayer'));
});

test('hifz configuration update rejects an invalid hifz time', { concurrency: false }, async () => {
	const replies: any[] = [];
	const originalGet = configurationRepository.getConfiguration;
	configurationRepository.getConfiguration = async () => buildConfiguration();

	try {
		await handleHifzConfigurationCommand(
			buildInteraction({ subcommand: 'update', stringOptions: { 'hifz-time': 'nope' }, replies })
		);
		assert.equal(replies.length, 1);
		assert.match(replies[0].content, /Invalid hifz time/);
	} finally {
		configurationRepository.getConfiguration = originalGet;
	}
});

test('hifz configuration update rejects invalid hifz days shortcuts', { concurrency: false }, async () => {
	const replies: any[] = [];
	const originalGet = configurationRepository.getConfiguration;
	configurationRepository.getConfiguration = async () => buildConfiguration();

	try {
		await handleHifzConfigurationCommand(
			buildInteraction({ subcommand: 'update', stringOptions: { 'hifz-days': 'daily' }, replies })
		);
		assert.equal(replies.length, 1);
		assert.match(replies[0].content, /Invalid hifz days/);
		assert.match(replies[0].content, /No shortcuts/);
	} finally {
		configurationRepository.getConfiguration = originalGet;
	}
});

test('hifz configuration update rejects invalid hifz days with unknown day name', { concurrency: false }, async () => {
	const replies: any[] = [];
	const originalGet = configurationRepository.getConfiguration;
	configurationRepository.getConfiguration = async () => buildConfiguration();

	try {
		await handleHifzConfigurationCommand(
			buildInteraction({ subcommand: 'update', stringOptions: { 'hifz-days': 'Friday, someday' }, replies })
		);
		assert.equal(replies.length, 1);
		assert.match(replies[0].content, /Invalid hifz days/);
	} finally {
		configurationRepository.getConfiguration = originalGet;
	}
});

test('hifz configuration update persists valid hifz days', { concurrency: false }, async () => {
	const replies: any[] = [];
	const updates: any[] = [];
	const originalGet = configurationRepository.getConfiguration;
	const originalUpdate = configurationRepository.updateConfiguration;
	configurationRepository.getConfiguration = async () => buildConfiguration({ hifzEnabled: 0 });
	configurationRepository.updateConfiguration = async (payload: any) => {
		updates.push(payload);
	};

	try {
		await handleHifzConfigurationCommand(
			buildInteraction({ subcommand: 'update', stringOptions: { 'hifz-days': 'Sunday, Thursday' }, replies })
		);
		assert.equal(updates.length, 1);
		assert.equal(updates[0].hifzWeekdays, '4,7');
		assert.match(String(replies[0]), /Hifz days set to.*Sunday/);
	} finally {
		configurationRepository.getConfiguration = originalGet;
		configurationRepository.updateConfiguration = originalUpdate;
	}
});

test('hifz configuration update with no options replies accordingly', { concurrency: false }, async () => {
	const replies: any[] = [];
	const originalGet = configurationRepository.getConfiguration;
	configurationRepository.getConfiguration = async () => buildConfiguration();

	try {
		await handleHifzConfigurationCommand(buildInteraction({ subcommand: 'update', replies }));
		assert.equal(replies.length, 1);
		assert.match(replies[0].content, /No options provided/);
	} finally {
		configurationRepository.getConfiguration = originalGet;
	}
});

test('hifz configuration show renders the hifz settings embed', { concurrency: false }, async () => {
	const replies: any[] = [];
	const originalGet = configurationRepository.getConfiguration;
	configurationRepository.getConfiguration = async () =>
		buildConfiguration({ hifzEnabled: 1, hifzRoleId: 'hifz-role', hifzTime: '6:00 PM', hifzTimeSyncEnabled: 1, hifzTimeSyncPrayer: 'dhuhr', hifzWeekdays: '4,7' });

	try {
		await handleHifzConfigurationCommand(buildInteraction({ subcommand: 'show', replies }));
		assert.equal(replies.length, 1);
		assert.equal(replies[0].embeds.length, 1);
		const fields = Object.fromEntries(replies[0].embeds[0].data.fields.map((f: any) => [f.name, f.value]));
		assert.equal(fields['Enabled'], 'Yes');
		assert.equal(fields['Reminder Time'], '6:00 PM');
		assert.match(fields['Days'], /Sunday/);
		assert.match(fields['Hifz time sync'], /Enabled.*dhuhr/);
	} finally {
		configurationRepository.getConfiguration = originalGet;
	}
});

test('hifz configuration show warns when hifz weekdays are not set', { concurrency: false }, async () => {
	const replies: any[] = [];
	const originalGet = configurationRepository.getConfiguration;
	configurationRepository.getConfiguration = async () =>
		buildConfiguration({ hifzEnabled: 1, hifzRoleId: 'hifz-role', hifzTime: '6:00 PM', hifzWeekdays: undefined });

	try {
		await handleHifzConfigurationCommand(buildInteraction({ subcommand: 'show', replies }));
		assert.equal(replies.length, 1);
		const fields = Object.fromEntries(replies[0].embeds[0].data.fields.map((f: any) => [f.name, f.value]));
		assert.match(fields['Days'], /Not set/);
		assert.match(fields['Days'], /⚠️/);
	} finally {
		configurationRepository.getConfiguration = originalGet;
	}
});

test('hifz configuration update persists a hifz-enabled toggle', { concurrency: false }, async () => {
	const replies: any[] = [];
	const updates: any[] = [];
	const originalGet = configurationRepository.getConfiguration;
	const originalUpdate = configurationRepository.updateConfiguration;
	configurationRepository.getConfiguration = async () => buildConfiguration({ hifzEnabled: 0 });
	configurationRepository.updateConfiguration = async (payload: any) => {
		updates.push(payload);
	};

	try {
		await handleHifzConfigurationCommand(
			buildInteraction({ subcommand: 'update', booleanOptions: { 'hifz-enabled': false }, replies })
		);
		assert.equal(updates.length, 1);
		assert.deepEqual(updates[0], { hifzEnabled: 0 });
		assert.equal(replies.length, 1);
		assert.match(String(replies[0]), /Hifz feature disabled/);
	} finally {
		configurationRepository.getConfiguration = originalGet;
		configurationRepository.updateConfiguration = originalUpdate;
	}
});

test('hifz configuration update persists several feature options at once', { concurrency: false }, async () => {
	const replies: any[] = [];
	const updates: any[] = [];
	const originalGet = configurationRepository.getConfiguration;
	const originalUpdate = configurationRepository.updateConfiguration;
	configurationRepository.getConfiguration = async () => buildConfiguration({ hifzEnabled: 0 });
	configurationRepository.updateConfiguration = async (payload: any) => {
		updates.push(payload);
	};

	try {
		await handleHifzConfigurationCommand(
			buildInteraction({
				subcommand: 'update',
				replies,
				roleOption: { id: 'role-9', toString: () => '<@&role-9>' },
				stringOptions: { 'hifz-time': '5:30 PM', 'hifz-days': 'Sunday, Thursday', 'hifz-time-sync-prayer': 'asr' },
				booleanOptions: { 'hifz-reminder-enabled': true, 'hifz-pre-reminder-enabled': false },
				integerOptions: { 'hifz-pre-reminder-minutes': 15, 'hifz-minutes-after-prayer': 60 },
			})
		);
		assert.equal(updates.length, 1);
		assert.deepEqual(updates[0], {
			hifzRoleId: 'role-9',
			hifzTime: '5:30 PM',
			hifzWeekdays: '4,7',
			hifzReminderEnabled: 1,
			hifzPreReminderEnabled: 0,
			hifzPreReminderOffsetMinutes: 15,
			hifzTimeSyncPrayer: 'asr',
			hifzTimeSyncOffsetMinutes: 60,
		});
		assert.match(String(replies[0]), /Hifz days set to/);
		assert.match(String(replies[0]), /Hifz time set to `5:30 PM`/);
		assert.match(String(replies[0]), /Hifz time sync prayer set to `asr`/);
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
	roleOption?: any;
}): any {
	return {
		options: {
			getSubcommand: () => options.subcommand,
			getString: (name: string) => options.stringOptions?.[name] ?? null,
			getBoolean: (name: string) => (options.booleanOptions?.[name] === undefined ? null : options.booleanOptions?.[name] ?? null),
			getRole: (name: string) => (name === 'hifz-role' && options.roleOption ? options.roleOption : null),
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
		hifzWeekdays: '',
		...config,
	};
}