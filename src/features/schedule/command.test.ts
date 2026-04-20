import assert from 'node:assert/strict';
import test from 'node:test';
import { MessageFlags } from 'discord.js';
import type { Schedule } from '../../storage/sqlite/repositories/ScheduleRepository';

process.env.DATABASE_PATH ??= ':memory:';
process.env.CHANNEL_ID ??= 'reminder-channel';

const { configurationRepository, scheduleRepository } = require('../../storage/sqlite') as typeof import('../../storage/sqlite');
const { scheduleStatuses, scheduleTypes } = require('../../storage/sqlite/repositories/ScheduleRepository') as typeof import('../../storage/sqlite/repositories/ScheduleRepository');
const { execute } = require('./command') as typeof import('./command');
const { buildOneTimeModalCustomId, buildRecurringModalCustomId } = require('./components') as typeof import('./components');
const { handleScheduleModalSubmit, handleScheduleSelectMenuInteraction } = require('./interactions') as typeof import('./interactions');
const { createPendingScheduleSetup, scheduleSetupActions } = require('./state') as typeof import('./state');

test('/schedule create-recurring returns a weekday picker', { concurrency: false }, async () => {
	let replyPayload: any;

	await execute(
		buildCommandInteraction({
			subcommand: 'create-recurring',
			reply: (payload) => {
				replyPayload = payload;
			},
		}) as any
	);

	assert.match(replyPayload.content, /Choose one or more days/);
	assert.equal(replyPayload.ephemeral, true);
	assert.equal(replyPayload.components.length, 1);
});

test('/schedule create-one-time opens a one-time modal', { concurrency: false }, async () => {
	let modal: any;

	await execute(
		buildCommandInteraction({
			subcommand: 'create-one-time',
			showModal: (payload) => {
				modal = payload;
			},
		}) as any
	);

	assert.match(modal.data.custom_id, /^schedule:modal:one-time:/);
});

test('weekday picker opens the recurring modal with selected days', { concurrency: false }, async () => {
	const token = createPendingScheduleSetup({ action: scheduleSetupActions.CREATE_RECURRING, userId: 'user-1' });
	let modal: any;

	const handled = await handleScheduleSelectMenuInteraction({
		customId: `schedule:weekday:${token}`,
		values: ['monday', 'thursday'],
		user: { id: 'user-1', username: 'User One' },
		guildId: 'guild-1',
		channelId: 'channel-1',
		showModal: async (payload: any) => {
			modal = payload;
		},
		reply: async () => undefined,
	});

	assert.equal(handled, true);
	assert.equal(modal.data.custom_id, buildRecurringModalCustomId(token));
});

test('recurring modal rejects invalid time', { concurrency: false }, async () => {
	const token = createPendingScheduleSetup({ action: scheduleSetupActions.CREATE_RECURRING, userId: 'user-1', weekdays: [1] });
	let replyPayload: any;

	const handled = await handleScheduleModalSubmit(
		buildModalInteraction({
			customId: buildRecurringModalCustomId(token),
			fields: {
				name: 'Team meeting',
				time: '25:00 PM',
				message: 'Team meeting starts soon.',
			},
			reply: (payload) => {
				replyPayload = payload;
			},
		}) as any
	);

	assert.equal(handled, true);
	assert.equal(replyPayload.flags, MessageFlags.Ephemeral);
	assert.match(replyPayload.content, /Invalid time/);
});

test('one-time modal rejects invalid date', { concurrency: false }, async () => {
	const token = createPendingScheduleSetup({ action: scheduleSetupActions.CREATE_ONE_TIME, userId: 'user-1' });
	let replyPayload: any;

	const handled = await handleScheduleModalSubmit(
		buildModalInteraction({
			customId: buildOneTimeModalCustomId(token),
			fields: {
				name: 'Appointment',
				date: '2026-02-31',
				time: '7:30 PM',
				message: 'Appointment starts soon.',
			},
			reply: (payload) => {
				replyPayload = payload;
			},
		}) as any
	);

	assert.equal(handled, true);
	assert.equal(replyPayload.flags, MessageFlags.Ephemeral);
	assert.match(replyPayload.content, /Invalid date/);
});

test('/schedule list renders the schedule dashboard', { concurrency: false }, async () => {
	let replyPayload: any;

	await withRepositoryMocks(
		{
			getConfiguration: async () => ({ timezone: 'UTC' }),
			getActiveSchedules: async () => [
				buildSchedule({
					name: 'Team meeting',
					weekdays: '1,4',
					time: '7:30 PM',
					message: 'Team meeting starts soon.',
				}),
			],
		},
		async () => {
			await execute(
				buildCommandInteraction({
					subcommand: 'list',
					client: createClient(),
					reply: (payload) => {
						replyPayload = payload;
					},
				}) as any
			);
		}
	);

	const fields = getEmbedFields(replyPayload);
	assert.equal(replyPayload.flags, MessageFlags.Ephemeral);
	assert.match(fields['Team meeting'], /Monday and Thursday at 7:30 PM/);
	assert.match(fields['Team meeting'], /Next:/);
});

test('/schedule delete removes a schedule and refreshes jobs', { concurrency: false }, async () => {
	let replyPayload: any;
	let deletedName: string | null = null;

	await withRepositoryMocks(
		{
			getConfiguration: async () => ({ timezone: 'UTC' }),
			getActiveSchedules: async () => [],
			deleteScheduleByName: async (name: string) => {
				deletedName = name;
				return true;
			},
		},
		async () => {
			await execute(
				buildCommandInteraction({
					subcommand: 'delete',
					strings: { name: 'Team meeting' },
					client: createClient(),
					reply: (payload) => {
						replyPayload = payload;
					},
				}) as any
			);
		}
	);

	assert.equal(deletedName, 'Team meeting');
	assert.equal(replyPayload.flags, MessageFlags.Ephemeral);
	assert.match(replyPayload.content, /Deleted schedule/);
});

async function withRepositoryMocks(overrides: any, callback: () => Promise<void>): Promise<void> {
	const originalGetConfiguration = configurationRepository.getConfiguration;
	const originalGetActiveSchedules = scheduleRepository.getActiveSchedules;
	const originalDeleteScheduleByName = scheduleRepository.deleteScheduleByName;

	if (overrides.getConfiguration) {
		configurationRepository.getConfiguration = overrides.getConfiguration;
	}
	if (overrides.getActiveSchedules) {
		scheduleRepository.getActiveSchedules = overrides.getActiveSchedules;
	}
	if (overrides.deleteScheduleByName) {
		scheduleRepository.deleteScheduleByName = overrides.deleteScheduleByName;
	}

	try {
		await callback();
	} finally {
		configurationRepository.getConfiguration = originalGetConfiguration;
		scheduleRepository.getActiveSchedules = originalGetActiveSchedules;
		scheduleRepository.deleteScheduleByName = originalDeleteScheduleByName;
	}
}

function buildCommandInteraction(options: {
	subcommand: string;
	strings?: Record<string, string>;
	reply?: (payload: any) => void;
	showModal?: (payload: any) => void;
	client?: any;
}): Record<string, unknown> {
	const client = options.client ?? createClient();
	return {
		options: {
			getSubcommand: () => options.subcommand,
			getString: (name: string) => options.strings?.[name] ?? null,
		},
		user: { id: 'user-1', username: 'User One' },
		guildId: 'guild-1',
		channelId: 'channel-1',
		client,
		guild: client.guilds.cache.get('guild-1'),
		reply: async (payload: any) => options.reply?.(payload),
		showModal: async (payload: any) => options.showModal?.(payload),
	};
}

function buildModalInteraction(options: {
	customId: string;
	fields: Record<string, string>;
	reply: (payload: any) => void;
	client?: any;
}): Record<string, unknown> {
	const client = options.client ?? createClient();
	return {
		customId: options.customId,
		fields: {
			getTextInputValue: (name: string) => options.fields[name],
		},
		user: { id: 'user-1', username: 'User One' },
		guildId: 'guild-1',
		channelId: 'channel-1',
		client,
		guild: client.guilds.cache.get('guild-1'),
		reply: async (payload: any) => options.reply(payload),
	};
}

function createClient() {
	const reminderChannel = {
		id: 'reminder-channel',
		name: 'reminders',
		send: async () => undefined,
	};
	const guild = {
		id: 'guild-1',
		channels: {
			cache: new Map([['reminder-channel', reminderChannel]]),
		},
	};

	return {
		channels: {
			cache: new Map([['reminder-channel', reminderChannel]]),
		},
		guilds: {
			cache: new Map([['guild-1', guild]]),
		},
	};
}

function buildSchedule(schedule: Partial<Schedule>): Schedule {
	return {
		id: 1,
		name: 'Schedule',
		nameKey: 'schedule',
		type: scheduleTypes.RECURRING,
		weekdays: '1',
		oneTimeDate: null,
		time: '7:30 PM',
		message: 'Reminder.',
		status: scheduleStatuses.ACTIVE,
		creatorUserId: 'user-1',
		createdAt: '2026-04-15T12:00:00.000Z',
		updatedAt: '2026-04-15T12:00:00.000Z',
		lastRunAt: null,
		...schedule,
	};
}

function getEmbedFields(replyPayload: any): Record<string, string> {
	const fields = replyPayload.embeds[0].data.fields ?? [];
	return Object.fromEntries(fields.map((field: any) => [field.name, field.value]));
}
