import assert from 'node:assert/strict';
import test from 'node:test';
import { MessageFlags, PermissionsBitField } from 'discord.js';
import type { Configuration } from '../../../storage/sqlite/repositories/ConfigurationRepository';
import type { Progress } from '../../../storage/sqlite/repositories/ProgressRepository';

process.env.DATABASE_PATH ??= ':memory:';

const { configurationRepository, notesRepository, progressRepository } = require('../../../storage/sqlite') as typeof import('../../../storage/sqlite');
const { handleProgressCommand } = require('./handler') as typeof import('./handler');
const {
	parseReminderActionCustomId,
	reminderActions,
} = require('../reminders/components') as typeof import('../reminders/components');
const { buildQuranPageImageUrl, buildQuranPageReadUrl } = require('../../../shared/quran/pageImages') as typeof import('../../../shared/quran/pageImages');

test('maqraah progress show renders current reading progress and pending note count', { concurrency: false }, async () => {
	const previousChannelId = process.env.CHANNEL_ID;
	process.env.CHANNEL_ID = 'reminder-channel';
	let replyPayload: any;

	await withRepositoryMocks(
		{
			getConfiguration: async () =>
				buildConfiguration({
					roleId: 'role-1',
					dailyTime: '7:00 PM',
					timezone: 'UTC',
					voiceChannelId: 'voice-channel',
			}),
			getProgress: async () => buildProgress({ currentPage: 300, currentHadith: 34 }),
			getNotesByStatus: async () => [
				{ id: 1, userId: 'user-1', note: 'First note', dateAdded: '2026-04-15T12:00:00.000Z', status: 'pending' },
				{ id: 2, userId: 'user-2', note: 'Second note', dateAdded: '2026-04-15T13:00:00.000Z', status: 'pending' },
			],
		},
		async () => {
			await handleProgressCommand(
				buildInteraction({
					subcommand: 'show',
					reply: (payload) => {
						replyPayload = payload;
					},
					client: createClient(),
				}) as any,
				{ commandName: 'maqraah', subcommandGroup: 'progress', now: new Date('2026-04-15T18:00:00.000Z') }
			);
		}
	);

	restoreEnv('CHANNEL_ID', previousChannelId);

	const fields = getEmbedFields(replyPayload);
	assert.equal(replyPayload.flags, MessageFlags.Ephemeral);
	assert.deepEqual(replyPayload.allowedMentions, { parse: [] });
	assert.match(fields["Qur'an Progress"], /Current page: 300 \/ 604/);
	assert.doesNotMatch(fields["Qur'an Progress"], /Next Page|Percentage complete|Pages remaining|Estimated completion/);
	assert.match(fields['Hadith Progress'], /Current Hadith: 34/);
	assert.doesNotMatch(fields['Hadith Progress'], /Next Hadith/);
	assert.match(fields['Next Maqraah'], /2026-04-15 at 7:00 PM \(UTC\)/);
	assert.equal(fields['Reminder Channel'], '<#reminder-channel>');
	assert.equal(fields['Reminder Role'], '<@&role-1>');
	assert.equal(fields['Voice Channel'], '<#voice-channel>');
	assert.equal(fields['Pending Notes'], '2 pending notes');
	assert.equal(fields['Warnings'], 'None');
});

test('maqraah progress show handles page 604 without showing note content', { concurrency: false }, async () => {
	const previousChannelId = process.env.CHANNEL_ID;
	process.env.CHANNEL_ID = 'reminder-channel';
	let replyPayload: any;

	await withRepositoryMocks(
		{
			getConfiguration: async () => buildConfiguration({ roleId: 'role-1', voiceChannelId: 'voice-channel', timezone: 'UTC' }),
			getProgress: async () => buildProgress({ currentPage: 604, currentHadith: 1 }),
			getNotesByStatus: async () => [],
		},
		async () => {
			await handleProgressCommand(
				buildInteraction({
					subcommand: 'show',
					reply: (payload) => {
						replyPayload = payload;
					},
					client: createClient(),
				}) as any,
				{ commandName: 'maqraah', subcommandGroup: 'progress', now: new Date('2026-04-15T12:00:00.000Z') }
			);
		}
	);

	restoreEnv('CHANNEL_ID', previousChannelId);

	const fields = getEmbedFields(replyPayload);
	assert.match(fields["Qur'an Progress"], /Current page: 604 \/ 604/);
	assert.doesNotMatch(fields["Qur'an Progress"], /Next Page|Estimated completion/);
	assert.equal(fields['Pending Notes'], '0 pending notes');
	assert.doesNotMatch(JSON.stringify(replyPayload), /First note|Second note|secret/i);
});

test('maqraah progress show warns about invalid or missing configuration without throwing', { concurrency: false }, async () => {
	const previousChannelId = process.env.CHANNEL_ID;
	delete process.env.CHANNEL_ID;
	let replyPayload: any;

	await withRepositoryMocks(
		{
			getConfiguration: async () =>
				buildConfiguration({
					roleId: 'Not set',
					dailyTime: '25:00 PM',
					timezone: 'Mars/Base',
					voiceChannelId: '',
					mainReminderEnabled: 0,
				}),
			getProgress: async () => buildProgress({ currentPage: 10, currentHadith: 20 }),
			getNotesByStatus: async () => [],
		},
		async () => {
			await handleProgressCommand(
				buildInteraction({
					subcommand: 'show',
					reply: (payload) => {
						replyPayload = payload;
					},
					client: createClient({ includeRole: false, includeVoiceChannel: false }),
				}) as any,
				{ commandName: 'maqraah', subcommandGroup: 'progress', now: new Date('2026-04-15T12:00:00.000Z') }
			);
		}
	);

	restoreEnv('CHANNEL_ID', previousChannelId);

	const fields = getEmbedFields(replyPayload);
	assert.equal(fields['Next Maqraah'], 'Not available');
	assert.match(fields["Qur'an Progress"], /Current page: 10 \/ 604/);
	assert.match(fields['Warnings'], /Maqraah time is invalid/);
	assert.match(fields['Warnings'], /Timezone is invalid/);
	assert.match(fields['Warnings'], /Maqraah reminders are disabled/);
	assert.match(fields['Warnings'], /Reminder role is not configured/);
	assert.match(fields['Warnings'], /Reminder channel is not configured/);
	assert.match(fields['Warnings'], /Voice channel is not configured/);
});

test('maqraah progress post-current-page sends the current page prompt to the configured reminder channel', { concurrency: false }, async () => {
	const previousChannelId = process.env.CHANNEL_ID;
	process.env.CHANNEL_ID = 'reminder-channel';
	const client = createClient();
	const reminderChannel = client.channels.cache.get('reminder-channel') as any;
	let replyPayload: any;

	await withRepositoryMocks(
		{
			getConfiguration: async () => buildConfiguration({ timezone: 'Asia/Tokyo' }),
			getProgress: async () => buildProgress({ currentPage: 321, currentHadith: 44 }),
		},
		async () => {
			await handleProgressCommand(
				buildInteraction({
					subcommand: 'post-current-page',
					reply: (payload) => {
						replyPayload = payload;
					},
					client,
				}) as any,
				{ commandName: 'maqraah', subcommandGroup: 'progress', now: new Date('2026-04-15T16:30:00.000Z') }
			);
		}
	);

	restoreEnv('CHANNEL_ID', previousChannelId);

	assert.equal(reminderChannel.sentMessages.length, 1);
	assertCurrentPagePrompt(reminderChannel.sentMessages[0], '2026-04-16', 321);
	assert.deepEqual(replyPayload, {
		content: "Posted current Qur'an page prompt for page **321** in <#reminder-channel>.",
		flags: MessageFlags.Ephemeral,
	});
});

test('maqraah progress post-current-page refuses when CHANNEL_ID is unset', { concurrency: false }, async () => {
	const previousChannelId = process.env.CHANNEL_ID;
	delete process.env.CHANNEL_ID;
	const client = createClient();
	const reminderChannel = client.channels.cache.get('reminder-channel') as any;
	let replyPayload: any;
	let getProgressCalls = 0;

	await withRepositoryMocks(
		{
			getProgress: async () => {
				getProgressCalls++;
				return buildProgress({ currentPage: 42 });
			},
		},
		async () => {
			await handleProgressCommand(
				buildInteraction({
					subcommand: 'post-current-page',
					reply: (payload) => {
						replyPayload = payload;
					},
					client,
				}) as any,
				{ commandName: 'maqraah', subcommandGroup: 'progress', now: new Date('2026-04-15T16:30:00.000Z') }
			);
		}
	);

	restoreEnv('CHANNEL_ID', previousChannelId);

	assert.equal(getProgressCalls, 0);
	assert.equal(reminderChannel.sentMessages.length, 0);
	assert.deepEqual(replyPayload, {
		content: 'Reminder channel is not configured. Set CHANNEL_ID before using this command.',
		flags: MessageFlags.Ephemeral,
	});
});

test('maqraah progress post-current-page refuses when the configured reminder channel is missing', { concurrency: false }, async () => {
	const previousChannelId = process.env.CHANNEL_ID;
	process.env.CHANNEL_ID = 'missing-channel';
	let replyPayload: any;
	let getProgressCalls = 0;

	await withRepositoryMocks(
		{
			getProgress: async () => {
				getProgressCalls++;
				return buildProgress({ currentPage: 42 });
			},
		},
		async () => {
			await handleProgressCommand(
				buildInteraction({
					subcommand: 'post-current-page',
					reply: (payload) => {
						replyPayload = payload;
					},
					client: createClient(),
				}) as any,
				{ commandName: 'maqraah', subcommandGroup: 'progress', now: new Date('2026-04-15T16:30:00.000Z') }
			);
		}
	);

	restoreEnv('CHANNEL_ID', previousChannelId);

	assert.equal(getProgressCalls, 0);
	assert.deepEqual(replyPayload, {
		content: 'Reminder channel <#missing-channel> was not found or is not sendable.',
		flags: MessageFlags.Ephemeral,
	});
});

test('maqraah progress post-current-page refuses when the configured reminder channel is not sendable', { concurrency: false }, async () => {
	const previousChannelId = process.env.CHANNEL_ID;
	process.env.CHANNEL_ID = 'reminder-channel';
	const client = createClient({ reminderChannelSendable: false });
	const reminderChannel = client.channels.cache.get('reminder-channel') as any;
	let replyPayload: any;
	let getProgressCalls = 0;

	await withRepositoryMocks(
		{
			getProgress: async () => {
				getProgressCalls++;
				return buildProgress({ currentPage: 42 });
			},
		},
		async () => {
			await handleProgressCommand(
				buildInteraction({
					subcommand: 'post-current-page',
					reply: (payload) => {
						replyPayload = payload;
					},
					client,
				}) as any,
				{ commandName: 'maqraah', subcommandGroup: 'progress', now: new Date('2026-04-15T16:30:00.000Z') }
			);
		}
	);

	restoreEnv('CHANNEL_ID', previousChannelId);

	assert.equal(getProgressCalls, 0);
	assert.equal(reminderChannel.sentMessages.length, 0);
	assert.deepEqual(replyPayload, {
		content: 'Reminder channel <#reminder-channel> was not found or is not sendable.',
		flags: MessageFlags.Ephemeral,
	});
});

test('maqraah progress update persists quran and hadith progress', { concurrency: false }, async () => {
	const quranUpdates: number[] = [];
	const hadithUpdates: Array<Partial<Progress>> = [];
	let replyPayload: any;

	await withRepositoryMocks(
		{
			updateQuranProgress: async (currentPage: number) => {
				quranUpdates.push(currentPage);
			},
			updateProgress: async (update: Partial<Progress>) => {
				hadithUpdates.push(update);
			},
		},
		async () => {
			await handleProgressCommand(
				buildInteraction({
					subcommand: 'update',
					integers: { 'page': 22, 'hadith': 40 },
					reply: (payload) => {
						replyPayload = payload;
					},
				}) as any,
				{ commandName: 'maqraah', subcommandGroup: 'progress' }
			);
		}
	);

	assert.deepEqual(quranUpdates, [22]);
	assert.deepEqual(hadithUpdates, [{ currentHadith: 40 }]);
	assert.match(replyPayload, /Current Qur'an page set to `22`\./);
	assert.match(replyPayload, /Current Hadith set to `40`\./);
	assert.doesNotMatch(replyPayload, /Khatmah/);
});

test('maqraah progress update ignores removed legacy option names', { concurrency: false }, async () => {
	let quranUpdateCalls = 0;
	let hadithUpdateCalls = 0;
	let replyPayload: any;

	await withRepositoryMocks(
		{
			updateQuranProgress: async () => {
				quranUpdateCalls++;
			},
			updateProgress: async () => {
				hadithUpdateCalls++;
			},
		},
		async () => {
			await handleProgressCommand(
				buildInteraction({
					subcommand: 'update',
					integers: { 'last-quran-page-read': 22, 'last-hadith': 40 },
					reply: (payload) => {
						replyPayload = payload;
					},
				}) as any,
				{ commandName: 'maqraah', subcommandGroup: 'progress' }
			);
		}
	);

	assert.equal(quranUpdateCalls, 0);
	assert.equal(hadithUpdateCalls, 0);
	assert.deepEqual(replyPayload, { content: 'No options provided.', flags: MessageFlags.Ephemeral });
});

test('maqraah progress update for hadith only does not touch quran page tracking', { concurrency: false }, async () => {
	let quranUpdateCalls = 0;
	const hadithUpdates: Array<Partial<Progress>> = [];

	await withRepositoryMocks(
		{
			updateQuranProgress: async () => {
				quranUpdateCalls++;
			},
			updateProgress: async (update: Partial<Progress>) => {
				hadithUpdates.push(update);
			},
		},
		async () => {
			await handleProgressCommand(
				buildInteraction({
					subcommand: 'update',
					integers: { 'hadith': 12 },
					reply: () => undefined,
				}) as any,
				{ commandName: 'maqraah', subcommandGroup: 'progress' }
			);
		}
	);

	assert.equal(quranUpdateCalls, 0);
	assert.deepEqual(hadithUpdates, [{ currentHadith: 12 }]);
});

async function withRepositoryMocks(overrides: any, callback: () => Promise<void>): Promise<void> {
	const originalGetConfiguration = configurationRepository.getConfiguration;
	const originalGetProgress = progressRepository.getProgress;
	const originalUpdateProgress = progressRepository.updateProgress;
	const originalUpdateQuranProgress = progressRepository.updateQuranProgress;
	const originalGetNotesByStatus = notesRepository.getNotesByStatus;

	if (overrides.getConfiguration) {
		configurationRepository.getConfiguration = overrides.getConfiguration;
	}

	if (overrides.getProgress) {
		progressRepository.getProgress = overrides.getProgress;
	}

	if (overrides.updateProgress) {
		progressRepository.updateProgress = overrides.updateProgress;
	}

	if (overrides.updateQuranProgress) {
		progressRepository.updateQuranProgress = overrides.updateQuranProgress;
	}

	if (overrides.getNotesByStatus) {
		notesRepository.getNotesByStatus = overrides.getNotesByStatus;
	}

	try {
		await callback();
	} finally {
		configurationRepository.getConfiguration = originalGetConfiguration;
		progressRepository.getProgress = originalGetProgress;
		progressRepository.updateProgress = originalUpdateProgress;
		progressRepository.updateQuranProgress = originalUpdateQuranProgress;
		notesRepository.getNotesByStatus = originalGetNotesByStatus;
	}
}

function buildInteraction(options: {
	subcommand: string;
	integers?: Record<string, number>;
	reply: (payload: any) => void;
	client?: any;
}): Record<string, unknown> {
	const client = options.client ?? createClient();
	return {
		options: {
			getSubcommand: () => options.subcommand,
			getInteger: (name: string) => options.integers?.[name] ?? null,
		},
		user: {
			id: 'user-1',
			username: 'User One',
		},
		guildId: 'guild-1',
		channelId: 'interaction-channel',
		client,
		guild: client.guilds.cache.get('guild-1'),
		reply: async (payload: any) => {
			options.reply(payload);
		},
	};
}

function createClient(options: { includeRole?: boolean; includeVoiceChannel?: boolean; reminderChannelSendable?: boolean } = {}) {
	const includeRole = options.includeRole ?? true;
	const includeVoiceChannel = options.includeVoiceChannel ?? true;
	const user = { id: 'bot-user' };
	const reminderChannel = createChannel({
		id: 'reminder-channel',
		name: 'maqraah-reminders',
		permissions: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
		isSendable: options.reminderChannelSendable,
	});
	const voiceChannel = createChannel({
		id: 'voice-channel',
		name: 'Maqraah Voice',
		permissions: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ManageChannels],
		isVoiceBased: true,
	});
	const guildChannels = new Map<string, any>([['reminder-channel', reminderChannel]]);
	if (includeVoiceChannel) {
		guildChannels.set('voice-channel', voiceChannel);
	}

	const guild = {
		id: 'guild-1',
		roles: {
			cache: new Map(includeRole ? [['role-1', { id: 'role-1', name: 'Daily Readers' }]] : []),
		},
		channels: {
			cache: guildChannels,
		},
	};

	return {
		user,
		channels: {
			cache: new Map([['reminder-channel', reminderChannel]]),
		},
		guilds: {
			cache: new Map([['guild-1', guild]]),
		},
	};
}

function createChannel(options: { id: string; name: string; permissions: bigint[]; isVoiceBased?: boolean; isSendable?: boolean }) {
	const permissions = new PermissionsBitField(options.permissions);
	const sentMessages: any[] = [];
	return {
		id: options.id,
		name: options.name,
		sentMessages,
		send: async (payload: any) => {
			sentMessages.push(payload);
			return undefined;
		},
		permissionsFor: () => permissions,
		isVoiceBased: () => Boolean(options.isVoiceBased),
		isSendable: () => options.isSendable ?? true,
	};
}

function buildConfiguration(configuration: Partial<Configuration>): Configuration {
	return {
		roleId: 'role-1',
		dailyTime: '1:00 PM',
		timezone: 'Africa/Cairo',
		voiceChannelId: 'voice-channel',
		preReminderEnabled: 1,
		preReminderOffsetMinutes: 5,
		mainReminderEnabled: 1,
		maqraahTimeSyncEnabled: 0,
		maqraahTimeSyncOffsetMinutes: 30,
		maqraahTimeSyncLatitude: 30.0444,
		maqraahTimeSyncLongitude: 31.2357,
		maqraahTimeSyncCalculationMethod: 5,
		welcomeSentAt: null,
		...configuration,
	};
}

function buildProgress(progress: Partial<Progress>): Progress {
	return {
		currentPage: 1,
		currentHadith: 1,
		...progress,
	};
}

function getEmbedFields(replyPayload: any): Record<string, string> {
	const fields = replyPayload.embeds[0].data.fields ?? [];
	return Object.fromEntries(fields.map((field: any) => [field.name, field.value]));
}

function assertCurrentPagePrompt(payload: any, sessionId: string, page: number): void {
	assert.equal('content' in payload, false);
	const embed = payload.embeds?.[0].toJSON() as any;
	assert.equal(embed.title, `Page ${page}`);
	assert.equal(embed.url, buildQuranPageReadUrl(page));
	assert.equal(embed.image.url, buildQuranPageImageUrl(page));
	assert.equal(embed.footer.text, `Page ${page}`);

	const row = payload.components?.[0].toJSON() as any;
	assert.deepEqual(parseReminderActionCustomId(row.components[0].custom_id), {
		action: reminderActions.PREVIOUS_QURAN_PAGE,
		sessionId,
		page,
	});
	assert.deepEqual(parseReminderActionCustomId(row.components[1].custom_id), {
		action: reminderActions.NEXT_QURAN_PAGE,
		sessionId,
		page,
	});
}

function restoreEnv(name: string, value: string | undefined): void {
	if (value === undefined) {
		delete process.env[name];
	} else {
		process.env[name] = value;
	}
}
