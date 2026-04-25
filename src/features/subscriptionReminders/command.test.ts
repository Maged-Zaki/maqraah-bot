import assert from 'node:assert/strict';
import test from 'node:test';
import { MessageFlags } from 'discord.js';

process.env.DATABASE_PATH ??= ':memory:';
process.env.CHANNEL_ID ??= 'reminder-channel';

const { reminderSettingsRepository } = require('../../storage/sqlite') as typeof import('../../storage/sqlite');
const command = require('./command') as typeof import('./command');
const roleManager = require('./roleManager') as typeof import('./roleManager');
const scheduler = require('./scheduler') as typeof import('./scheduler');

test('/reminders subscribe adds the category subscription privately', { concurrency: false }, async () => {
	const replies: any[] = [];

	await withCommandMocks(
		{
			subscribeMemberToCategory: async () => ({ changed: true, role: { id: 'role-fasting', name: 'تذكيرات الصيام' } }),
		},
		async () => {
			await command.execute(createInteraction({ subcommand: 'subscribe', category: 'fasting', replies }));
		}
	);

	assert.deepEqual(replies, [{ content: 'You are subscribed to تذكيرات الصيام.', flags: MessageFlags.Ephemeral }]);
});

test('/reminders unsubscribe removes the category subscription privately', { concurrency: false }, async () => {
	const replies: any[] = [];

	await withCommandMocks(
		{
			unsubscribeMemberFromCategory: async () => ({ changed: true, role: { id: 'role-fasting', name: 'تذكيرات الصيام' } }),
		},
		async () => {
			await command.execute(createInteraction({ subcommand: 'unsubscribe', category: 'fasting', replies }));
		}
	);

	assert.deepEqual(replies, [{ content: 'You are unsubscribed from تذكيرات الصيام.', flags: MessageFlags.Ephemeral }]);
});

test('/reminders list shows the caller subscriptions privately', { concurrency: false }, async () => {
	const replies: any[] = [];
	const role = { id: 'role-fasting', name: 'تذكيرات الصيام' };

	await command.execute(
		createInteraction({
			subcommand: 'list',
			replies,
			guildRoles: [role],
			memberRoleIds: [role.id],
		})
	);

	assert.equal(replies[0].flags, MessageFlags.Ephemeral);
	assert.match(replies[0].content, /Subscribed: تذكيرات الصيام/);
	assert.match(replies[0].content, /Not subscribed: تذكيرات المناسبات الإسلامية/);
});

test('/reminders configuration show displays global configuration', { concurrency: false }, async () => {
	const replies: any[] = [];

	await withCommandMocks(
		{
			getSettings: async () => buildSettings({ daysBefore: 2, sendTime: '7:30 PM', channelId: 'custom-channel' }),
		},
		async () => {
			await command.execute(createInteraction({ group: 'configuration', subcommand: 'show', replies }));
		}
	);

	assert.equal(replies[0].flags, MessageFlags.Ephemeral);
	assert.equal(replies[0].embeds[0].data.title, 'Reminder Configuration');
	assert.equal(replies[0].embeds[0].data.fields[0].value, '2');
	assert.equal(replies[0].embeds[0].data.fields[1].value, '7:30 PM');
	assert.equal(replies[0].embeds[0].data.fields[2].value, '<#custom-channel>');
});

test('/reminders configuration update validates and saves global configuration with channel selection', { concurrency: false }, async () => {
	const replies: any[] = [];
	const rescheduledClients: any[] = [];
	const savedUpdates: any[] = [];

	await withCommandMocks(
		{
			updateSettings: async (updates: any) => {
				savedUpdates.push(updates);
				return buildSettings({ ...updates });
			},
			scheduleSubscriptionReminders: async (client: any) => {
				rescheduledClients.push(client);
			},
		},
		async () => {
			await command.execute(
				createInteraction({
					group: 'configuration',
					subcommand: 'update',
					replies,
					daysBefore: 3,
					time: '8:05 PM',
					channel: { id: 'custom-channel', isTextBased: () => true, send: async () => undefined },
				})
			);
		}
	);

	assert.equal(replies[0].flags, MessageFlags.Ephemeral);
	assert.match(replies[0].content, /Reminder configuration updated/);
	assert.match(replies[0].content, /Days before: 3/);
	assert.match(replies[0].content, /Send time: 8:05 PM/);
	assert.match(replies[0].content, /Channel: <#custom-channel>/);
	assert.deepEqual(savedUpdates, [{ daysBefore: 3, sendTime: '8:05 PM', channelId: 'custom-channel' }]);
	assert.deepEqual(rescheduledClients, ['client']);
});

test('/reminders configuration update supports partial updates', { concurrency: false }, async () => {
	const replies: any[] = [];
	const savedUpdates: any[] = [];

	await withCommandMocks(
		{
			updateSettings: async (updates: any) => {
				savedUpdates.push(updates);
				return buildSettings({ daysBefore: 1, sendTime: '6:00 PM', ...updates });
			},
			scheduleSubscriptionReminders: async () => undefined,
		},
		async () => {
			await command.execute(
				createInteraction({
					group: 'configuration',
					subcommand: 'update',
					replies,
					channel: { id: 'channel-only', isTextBased: () => true, send: async () => undefined },
				})
			);
		}
	);

	assert.equal(replies[0].flags, MessageFlags.Ephemeral);
	assert.match(replies[0].content, /Channel: <#channel-only>/);
	assert.deepEqual(savedUpdates, [{ channelId: 'channel-only' }]);
});

test('/reminders configuration update rejects invalid values', { concurrency: false }, async () => {
	const invalidDaysReplies: any[] = [];
	await command.execute(createInteraction({ group: 'configuration', subcommand: 'update', replies: invalidDaysReplies, daysBefore: -1 }));
	assert.match(invalidDaysReplies[0].content, /Invalid days-before/);

	const invalidTimeReplies: any[] = [];
	await command.execute(createInteraction({ group: 'configuration', subcommand: 'update', replies: invalidTimeReplies, time: '25:00 PM' }));
	assert.match(invalidTimeReplies[0].content, /Invalid time/);

	const invalidChannelReplies: any[] = [];
	await command.execute(
		createInteraction({
			group: 'configuration',
			subcommand: 'update',
			replies: invalidChannelReplies,
			channel: { id: 'voice-channel', isTextBased: () => false },
		})
	);
	assert.match(invalidChannelReplies[0].content, /Invalid channel/);
});

test('/reminders configuration update reports when no options are provided', { concurrency: false }, async () => {
	const replies: any[] = [];

	await command.execute(createInteraction({ group: 'configuration', subcommand: 'update', replies }));

	assert.deepEqual(replies, [{ content: 'No configuration options provided.', flags: MessageFlags.Ephemeral }]);
});

test('/reminders subscribe surfaces role permission failures clearly', { concurrency: false }, async () => {
	const replies: any[] = [];

	await withCommandMocks(
		{
			subscribeMemberToCategory: async () => {
				throw new Error('I need the Manage Roles permission before I can manage reminder subscriptions.');
			},
		},
		async () => {
			await command.execute(createInteraction({ subcommand: 'subscribe', category: 'fasting', replies }));
		}
	);

	assert.equal(replies[0].content, 'I need the Manage Roles permission before I can manage reminder subscriptions.');
	assert.equal(replies[0].flags, MessageFlags.Ephemeral);
});

async function withCommandMocks(overrides: any, callback: () => Promise<void>): Promise<void> {
	const originalSubscribe = roleManager.subscribeMemberToCategory;
	const originalUnsubscribe = roleManager.unsubscribeMemberFromCategory;
	const originalGetSettings = reminderSettingsRepository.getSettings;
	const originalUpdateSettings = reminderSettingsRepository.updateSettings;
	const originalSchedule = scheduler.scheduleSubscriptionReminders;

	if (overrides.subscribeMemberToCategory) roleManager.subscribeMemberToCategory = overrides.subscribeMemberToCategory;
	if (overrides.unsubscribeMemberFromCategory) roleManager.unsubscribeMemberFromCategory = overrides.unsubscribeMemberFromCategory;
	if (overrides.getSettings) reminderSettingsRepository.getSettings = overrides.getSettings;
	if (overrides.updateSettings) reminderSettingsRepository.updateSettings = overrides.updateSettings;
	if (overrides.scheduleSubscriptionReminders) scheduler.scheduleSubscriptionReminders = overrides.scheduleSubscriptionReminders;

	try {
		await callback();
	} finally {
		roleManager.subscribeMemberToCategory = originalSubscribe;
		roleManager.unsubscribeMemberFromCategory = originalUnsubscribe;
		reminderSettingsRepository.getSettings = originalGetSettings;
		reminderSettingsRepository.updateSettings = originalUpdateSettings;
		scheduler.scheduleSubscriptionReminders = originalSchedule;
	}
}

function createInteraction(input: any) {
	const rolesCache = new Map<string, any>();
	for (const role of input.guildRoles ?? []) {
		rolesCache.set(role.id, role);
	}

	const memberRolesCache = new Map<string, boolean>((input.memberRoleIds ?? []).map((roleId: string) => [roleId, true]));

	return {
		user: { id: 'user-1', username: 'User' },
		guildId: 'guild-1',
		channelId: 'interaction-channel',
		client: 'client',
		guild: {
			roles: { cache: rolesCache },
		},
		member: {
			roles: { cache: memberRolesCache },
		},
		options: {
			getSubcommandGroup: () => input.group ?? null,
			getSubcommand: () => input.subcommand,
			getString: (name: string) => {
				if (name === 'category') return input.category ?? null;
				if (name === 'time') return input.time ?? null;
				return null;
			},
			getInteger: (name: string) => (name === 'days-before' ? input.daysBefore ?? null : null),
			getChannel: (name: string) => (name === 'channel' ? input.channel ?? null : null),
		},
		reply: async (payload: any) => {
			input.replies.push(payload);
		},
	};
}

function buildSettings(overrides: any = {}) {
	return {
		id: 1,
		channelId: 'reminder-channel',
		daysBefore: 1,
		sendTime: '6:00 PM',
		updatedAt: '2026-04-20T12:00:00.000Z',
		...overrides,
	};
}
