import assert from 'node:assert/strict';
import test from 'node:test';
import { ApplicationCommandOptionType } from 'discord.js';

process.env.DATABASE_PATH ??= ':memory:';

const { configurationRepository } = require('../../storage/sqlite') as typeof import('../../storage/sqlite');
const { data, execute } = require('./command') as typeof import('./command');

test('configuration command has update and show subcommands', () => {
	const command = data.toJSON() as any;
	const optionNames = command.options.map((option: any) => option.name);

	assert.ok(optionNames.includes('update'));
	assert.ok(optionNames.includes('show'));
});

test('configuration update subcommand has expected options', () => {
	const command = data.toJSON() as any;
	const updateSubcommand = command.options.find((option: any) => option.name === 'update');
	assert.equal(updateSubcommand.type, ApplicationCommandOptionType.Subcommand);

	const optionNames = updateSubcommand.options.map((option: any) => option.name);
	assert.ok(optionNames.includes('role'));
	assert.ok(optionNames.includes('voicechannel'));
	assert.ok(optionNames.includes('maqraah-time'));
	assert.ok(optionNames.includes('timezone'));
	assert.ok(optionNames.includes('pre-reminder-enabled'));
	assert.ok(optionNames.includes('pre-reminder-minutes'));
	assert.ok(optionNames.includes('maqraah-reminder-enabled'));
	assert.ok(optionNames.includes('maqraah-time-sync-enabled'));
	assert.ok(optionNames.includes('maqraah-minutes-after-maghrib'));
	assert.ok(optionNames.includes('prayer-time-latitude'));
	assert.ok(optionNames.includes('prayer-time-longitude'));
});

test('configuration update rejects invalid maqraah time', { concurrency: false }, async () => {
	const replies: any[] = [];
	const originalGetConfiguration = configurationRepository.getConfiguration;
	configurationRepository.getConfiguration = async () => buildConfiguration();

	try {
		await execute(
			buildInteraction({
				subcommand: 'update',
				stringOptions: { 'maqraah-time': 'invalid time' },
				replies,
			})
		);

		assert.equal(replies.length, 1);
		assert.match(replies[0].content, /Invalid maqraah time/);
	} finally {
		configurationRepository.getConfiguration = originalGetConfiguration;
	}
});

test('configuration update rejects invalid timezone', { concurrency: false }, async () => {
	const replies: any[] = [];
	const originalGetConfiguration = configurationRepository.getConfiguration;
	configurationRepository.getConfiguration = async () => buildConfiguration();

	try {
		await execute(
			buildInteraction({
				subcommand: 'update',
				stringOptions: { timezone: 'Not/A_Timezone' },
				replies,
			})
		);

		assert.equal(replies.length, 1);
		assert.match(replies[0].content, /Invalid timezone/);
	} finally {
		configurationRepository.getConfiguration = originalGetConfiguration;
	}
});

test('configuration update with no options replies accordingly', { concurrency: false }, async () => {
	const replies: any[] = [];
	const originalGetConfiguration = configurationRepository.getConfiguration;
	configurationRepository.getConfiguration = async () => buildConfiguration();

	try {
		await execute(
			buildInteraction({
				subcommand: 'update',
				stringOptions: {},
				replies,
			})
		);

		assert.equal(replies.length, 1);
		assert.match(replies[0].content, /No options provided/);
	} finally {
		configurationRepository.getConfiguration = originalGetConfiguration;
	}
});

function buildInteraction(options: { subcommand: string; stringOptions?: Record<string, string | null>; booleanOptions?: Record<string, boolean | null>; replies: any[] }): Record<string, any> {
	return {
		options: {
			getSubcommand: () => options.subcommand,
			getString: (name: string) => options.stringOptions?.[name] ?? null,
			getBoolean: (name: string) => options.booleanOptions?.[name] ?? null,
			getRole: () => null,
			getChannel: () => null,
			getInteger: () => null,
			getNumber: () => null,
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

function buildConfiguration(): any {
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
	};
}
