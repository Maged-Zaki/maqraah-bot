import assert from 'node:assert/strict';
import test from 'node:test';
import { MessageFlags, PermissionsBitField } from 'discord.js';
import type { Configuration } from '../../../storage/sqlite/repositories/ConfigurationRepository';
import type { HifzProgress } from '../../../storage/sqlite/repositories/HifzProgressRepository';

process.env.DATABASE_PATH ??= ':memory:';

const { configurationRepository, notesRepository, hifzProgressRepository } = require('../../../storage/sqlite') as typeof import('../../../storage/sqlite');
const { handleHifzProgressCommand } = require('./handler') as typeof import('./handler');

test('hifz progress update stores the memorization page', { concurrency: false }, async () => {
	let updatedPage: number | null = null;
	let replyPayload: any;

	await withMocks(
		{ updateQuranProgress: async (page: number) => { updatedPage = page; } },
		async () => {
			await handleHifzProgressCommand(
				buildInteraction({ subcommand: 'update', integers: { page: 23 }, reply: (p) => { replyPayload = p; } }) as any,
				{ commandName: 'hifz', subcommandGroup: 'progress' }
			);
		}
	);

	assert.equal(updatedPage, 23);
	assert.equal(replyPayload, 'Current memorization page set to `23`.');
});

test('hifz progress update rejects pages out of range', { concurrency: false }, async () => {
	let updateCalled = false;
	let replyPayload: any;

	await withMocks(
		{ updateQuranProgress: async () => { updateCalled = true; } },
		async () => {
			await handleHifzProgressCommand(
				buildInteraction({ subcommand: 'update', integers: { page: 700 }, reply: (p) => { replyPayload = p; } }) as any,
				{ commandName: 'hifz', subcommandGroup: 'progress' }
			);
		}
	);

	assert.equal(updateCalled, false);
	assert.equal(replyPayload.flags, MessageFlags.Ephemeral);
	assert.match(replyPayload.content, /between 1 and 604/);
});

test('hifz progress show renders memorization progress and pending note count', { concurrency: false }, async () => {
	const previousChannelId = process.env.CHANNEL_ID;
	process.env.CHANNEL_ID = 'reminder-channel';
	let replyPayload: any;

	await withShowMocks(
		{
			getConfiguration: async () => buildConfiguration({ roleId: 'role-1', hifzTime: '7:00 PM', timezone: 'UTC' }),
			getProgress: async () => ({ currentPage: 300 }),
			getNotesByStatus: async () => [
				{ id: 1, userId: 'user-1', note: 'First note', dateAdded: '2026-04-15T12:00:00.000Z', status: 'pending' },
			],
		},
		async () => {
			await handleHifzProgressCommand(
				buildInteraction({ subcommand: 'show', reply: (p) => { replyPayload = p; }, client: createClient() }) as any,
				{ commandName: 'hifz', subcommandGroup: 'progress', now: new Date('2026-04-15T18:00:00.000Z') }
			);
		}
	);

	restoreEnv('CHANNEL_ID', previousChannelId);

	const fields = getEmbedFields(replyPayload);
	assert.equal(replyPayload.flags, MessageFlags.Ephemeral);
	assert.match(fields['Memorization Progress'], /Current page: 300 \/ 604/);
	assert.match(fields['Next Hifz'], /hifz-2026-04-15 at 7:00 PM \(UTC\)/);
	assert.equal(fields['Reminder Channel'], '<#reminder-channel>');
	assert.equal(fields['Reminder Role'], '<@&role-1>');
	assert.equal(fields['Pending Notes'], '1 pending note');
	assert.equal(fields['Warnings'], 'None');
});

async function withMocks(
	overrides: Partial<Pick<typeof hifzProgressRepository, 'updateQuranProgress'>>,
	callback: () => Promise<void>
): Promise<void> {
	const originalUpdate = hifzProgressRepository.updateQuranProgress;
	if (overrides.updateQuranProgress) {
		hifzProgressRepository.updateQuranProgress = overrides.updateQuranProgress;
	}
	try {
		await callback();
	} finally {
		hifzProgressRepository.updateQuranProgress = originalUpdate;
	}
}

async function withShowMocks(
	overrides: Partial<
		Pick<typeof configurationRepository, 'getConfiguration'> &
			Pick<typeof hifzProgressRepository, 'getProgress'> &
			Pick<typeof notesRepository, 'getNotesByStatus'>
	>,
	callback: () => Promise<void>
): Promise<void> {
	const originals = {
		getConfiguration: configurationRepository.getConfiguration,
		getProgress: hifzProgressRepository.getProgress,
		getNotesByStatus: notesRepository.getNotesByStatus,
	};
	if (overrides.getConfiguration) {
		configurationRepository.getConfiguration = overrides.getConfiguration;
	}
	if (overrides.getProgress) {
		hifzProgressRepository.getProgress = overrides.getProgress;
	}
	if (overrides.getNotesByStatus) {
		notesRepository.getNotesByStatus = overrides.getNotesByStatus;
	}
	try {
		await callback();
	} finally {
		configurationRepository.getConfiguration = originals.getConfiguration;
		hifzProgressRepository.getProgress = originals.getProgress;
		notesRepository.getNotesByStatus = originals.getNotesByStatus;
	}
}

function buildInteraction(options: { subcommand: string; reply: (payload: any) => void; integers?: Record<string, number>; client?: any }): Record<string, unknown> {
	return {
		options: {
			getSubcommand: () => options.subcommand,
			getInteger: (name: string) => options.integers?.[name] ?? null,
		},
		user: { id: 'user-1', username: 'User One' },
		guildId: 'guild-1',
		channelId: 'interaction-channel',
		client: options.client,
		guild: options.client?.guilds?.cache?.get('guild-1'),
		reply: async (payload: any) => {
			options.reply(payload);
		},
	};
}

function createClient() {
	const permissions = new PermissionsBitField([PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]);
	const reminderChannel = {
		id: 'reminder-channel',
		name: 'hifz-reminders',
		send: async () => undefined,
		permissionsFor: () => permissions,
		isSendable: () => true,
	};
	const guild = {
		id: 'guild-1',
		roles: { cache: new Map([['role-1', { id: 'role-1', name: 'Hifz Group' }]]) },
		channels: { cache: new Map([['reminder-channel', reminderChannel]]) },
	};
	return {
		user: { id: 'bot-user' },
		channels: { cache: new Map([['reminder-channel', reminderChannel]]) },
		guilds: { cache: new Map([['guild-1', guild]]) },
	};
}

function buildConfiguration(configuration: Partial<Configuration>): Configuration {
	return {
		roleId: 'role-1',
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
		hifzTime: '6:00 PM',
		hifzReminderEnabled: 1,
		hifzPreReminderEnabled: 1,
		hifzPreReminderOffsetMinutes: 5,
		...configuration,
	};
}

function getEmbedFields(replyPayload: any): Record<string, string> {
	const fields = replyPayload.embeds[0].data.fields ?? [];
	return Object.fromEntries(fields.map((field: any) => [field.name, field.value]));
}

function restoreEnv(name: string, previousValue: string | undefined): void {
	if (previousValue === undefined) {
		delete process.env[name];
	} else {
		process.env[name] = previousValue;
	}
}
