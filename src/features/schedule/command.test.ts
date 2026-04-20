import assert from 'node:assert/strict';
import test from 'node:test';
import { MessageFlags } from 'discord.js';
import type { Schedule } from '../../storage/sqlite/repositories/ScheduleRepository';

process.env.DATABASE_PATH ??= ':memory:';
process.env.CHANNEL_ID ??= 'reminder-channel';

const { configurationRepository, scheduleRepository } = require('../../storage/sqlite') as typeof import('../../storage/sqlite');
const { scheduleStatuses, scheduleTypes } = require('../../storage/sqlite/repositories/ScheduleRepository') as typeof import('../../storage/sqlite/repositories/ScheduleRepository');
const { execute } = require('./command') as typeof import('./command');

test('/schedule create-recurring saves the schedule from command options', { concurrency: false }, async () => {
	let createdInput: any;
	let replyPayload: any;
	const sentMessages: any[] = [];

	await withRepositoryMocks(
		{
			getConfiguration: async () => ({ timezone: 'UTC' }),
			getActiveSchedules: async () => [],
			createSchedule: async (input: any) => {
				createdInput = input;
				return buildSchedule({
					id: 10,
					name: input.name,
					weekdays: input.weekdays,
					time: input.time,
					message: input.message,
					mentionUserIds: input.mentionUserIds,
				});
			},
		},
		async () => {
			await execute(
				buildCommandInteraction({
					subcommand: 'create-recurring',
					strings: {
						name: 'Team meeting',
						days: 'monday, thursday',
						time: '7:30 PM',
						message: '<@&role-1> Team meeting starts soon.',
						people: '<@123> <@456>',
					},
					client: createClient(sentMessages),
					reply: (payload) => {
						replyPayload = payload;
					},
				}) as any
			);
		}
	);

	assert.equal(createdInput.name, 'Team meeting');
	assert.equal(createdInput.weekdays, '1,4');
	assert.equal(createdInput.time, '7:30 PM');
	assert.equal(createdInput.mentionUserIds, '123,456');
	assert.equal(createdInput.creatorUserId, 'user-1');
	assert.equal(replyPayload.flags, MessageFlags.Ephemeral);
	assert.equal(getEmbedFields(replyPayload).When, 'Monday and Thursday at 7:30 PM');
	assert.equal(getEmbedFields(replyPayload).People, '<@123> <@456>');
	assert.equal(sentMessages.length, 1);
});

test('/schedule create-recurring notifies mentioned people after creation', { concurrency: false }, async () => {
	let createdInput: any;
	let replyPayload: any;
	const sentMessages: any[] = [];

	await withRepositoryMocks(
		{
			getConfiguration: async () => ({ timezone: 'UTC' }),
			getActiveSchedules: async () => [],
			createSchedule: async (input: any) => {
				createdInput = input;
				return buildSchedule({
					id: 12,
					name: input.name,
					weekdays: input.weekdays,
					time: input.time,
					message: input.message,
					mentionUserIds: input.mentionUserIds,
				});
			},
		},
		async () => {
			await execute(
				buildCommandInteraction({
					subcommand: 'create-recurring',
					strings: {
						name: 'Team meeting',
						days: 'monday, thursday',
						time: '7:30 PM',
						message: 'Team meeting starts soon.',
						people: '<@123> <@!456>, <@123>',
					},
					client: createClient(sentMessages),
					reply: (payload) => {
						replyPayload = payload;
					},
				}) as any
			);
		}
	);

	assert.equal(createdInput.name, 'Team meeting');
	assert.equal(createdInput.mentionUserIds, '123,456');
	assert.equal(replyPayload.flags, MessageFlags.Ephemeral);
	assert.equal(sentMessages.length, 1);
	assert.match(sentMessages[0].content, /^<@123> <@456>/);
	assert.match(sentMessages[0].content, /Team meeting/);
	assert.match(sentMessages[0].content, /Monday and Thursday at 7:30 PM/);
	assert.deepEqual(sentMessages[0].allowedMentions, { users: ['123', '456'] });
});

test('/schedule create-recurring rejects invalid days', { concurrency: false }, async () => {
	let replyPayload: any;

	await execute(
		buildCommandInteraction({
			subcommand: 'create-recurring',
			strings: {
				name: 'Team meeting',
				days: 'funday',
				time: '7:30 PM',
				message: 'Team meeting starts soon.',
				people: '<@123>',
			},
			reply: (payload) => {
				replyPayload = payload;
			},
		}) as any
	);

	assert.equal(replyPayload.flags, MessageFlags.Ephemeral);
	assert.match(replyPayload.content, /Invalid days/);
});

test('/schedule create-recurring requires people mentions', { concurrency: false }, async () => {
	let createCalled = false;
	let replyPayload: any;

	await withRepositoryMocks(
		{
			createSchedule: async () => {
				createCalled = true;
			},
		},
		async () => {
			await execute(
				buildCommandInteraction({
					subcommand: 'create-recurring',
					strings: {
						name: 'Team meeting',
						days: 'monday',
						time: '7:30 PM',
						message: 'Team meeting starts soon.',
					},
					reply: (payload) => {
						replyPayload = payload;
					},
				}) as any
			);
		}
	);

	assert.equal(createCalled, false);
	assert.equal(replyPayload.flags, MessageFlags.Ephemeral);
	assert.match(replyPayload.content, /Invalid people list/);
});

test('/schedule create-recurring rejects invalid people mentions', { concurrency: false }, async () => {
	let createCalled = false;
	let replyPayload: any;

	await withRepositoryMocks(
		{
			createSchedule: async () => {
				createCalled = true;
			},
		},
		async () => {
			await execute(
				buildCommandInteraction({
					subcommand: 'create-recurring',
					strings: {
						name: 'Team meeting',
						days: 'monday',
						time: '7:30 PM',
						message: 'Team meeting starts soon.',
						people: '<@123> asdas',
					},
					reply: (payload) => {
						replyPayload = payload;
					},
				}) as any
			);
		}
	);

	assert.equal(createCalled, false);
	assert.equal(replyPayload.flags, MessageFlags.Ephemeral);
	assert.match(replyPayload.content, /Invalid people list/);
});

test('/schedule create-one-time saves date and time from command options', { concurrency: false }, async () => {
	let createdInput: any;
	let replyPayload: any;
	const sentMessages: any[] = [];

	await withRepositoryMocks(
		{
			getConfiguration: async () => ({ timezone: 'UTC' }),
			getActiveSchedules: async () => [],
			createSchedule: async (input: any) => {
				createdInput = input;
				return buildSchedule({
					id: 11,
					type: scheduleTypes.ONE_TIME,
					name: input.name,
					weekdays: null,
					oneTimeDate: input.oneTimeDate,
					time: input.time,
					message: input.message,
					mentionUserIds: input.mentionUserIds,
				});
			},
		},
		async () => {
			await execute(
				buildCommandInteraction({
					subcommand: 'create-one-time',
					strings: {
						name: 'Appointment',
						date: '2099-04-20',
						time: '8:05 AM',
						message: 'Appointment starts soon.',
						people: '<@789>',
					},
					client: createClient(sentMessages),
					reply: (payload) => {
						replyPayload = payload;
					},
				}) as any
			);
		}
	);

	assert.equal(createdInput.type, scheduleTypes.ONE_TIME);
	assert.equal(createdInput.oneTimeDate, '2099-04-20');
	assert.equal(createdInput.time, '8:05 AM');
	assert.equal(createdInput.mentionUserIds, '789');
	assert.equal(replyPayload.flags, MessageFlags.Ephemeral);
	assert.equal(getEmbedFields(replyPayload).When, '2099-04-20 at 8:05 AM');
	assert.equal(getEmbedFields(replyPayload).People, '<@789>');
	assert.equal(sentMessages.length, 1);
});

test('/schedule create-one-time notifies mentioned people after creation', { concurrency: false }, async () => {
	let replyPayload: any;
	const sentMessages: any[] = [];

	await withRepositoryMocks(
		{
			getConfiguration: async () => ({ timezone: 'UTC' }),
			getActiveSchedules: async () => [],
			createSchedule: async (input: any) =>
				buildSchedule({
					id: 13,
					type: scheduleTypes.ONE_TIME,
					name: input.name,
					weekdays: null,
					oneTimeDate: input.oneTimeDate,
					time: input.time,
					message: input.message,
					mentionUserIds: input.mentionUserIds,
				}),
		},
		async () => {
			await execute(
				buildCommandInteraction({
					subcommand: 'create-one-time',
					strings: {
						name: 'Appointment',
						date: '2099-04-20',
						time: '8:05 AM',
						message: 'Appointment starts soon.',
						people: '<@789>',
					},
					client: createClient(sentMessages),
					reply: (payload) => {
						replyPayload = payload;
					},
				}) as any
			);
		}
	);

	assert.equal(replyPayload.flags, MessageFlags.Ephemeral);
	assert.equal(sentMessages.length, 1);
	assert.match(sentMessages[0].content, /^<@789>/);
	assert.match(sentMessages[0].content, /2099-04-20 at 8:05 AM/);
	assert.deepEqual(sentMessages[0].allowedMentions, { users: ['789'] });
});

test('/schedule create-one-time rejects invalid date', { concurrency: false }, async () => {
	let replyPayload: any;

	await execute(
		buildCommandInteraction({
			subcommand: 'create-one-time',
			strings: {
				name: 'Appointment',
				date: '2026-02-31',
				time: '7:30 PM',
				message: 'Appointment starts soon.',
				people: '<@123>',
			},
			reply: (payload) => {
				replyPayload = payload;
			},
		}) as any
	);

	assert.equal(replyPayload.flags, MessageFlags.Ephemeral);
	assert.match(replyPayload.content, /Invalid date/);
});

test('/schedule create-one-time rejects past date and time', { concurrency: false }, async () => {
	let replyPayload: any;

	await withRepositoryMocks(
		{
			getConfiguration: async () => ({ timezone: 'UTC' }),
		},
		async () => {
			await execute(
				buildCommandInteraction({
					subcommand: 'create-one-time',
					strings: {
						name: 'Past appointment',
						date: '2020-01-01',
						time: '7:30 PM',
						message: 'Appointment starts soon.',
						people: '<@123>',
					},
					reply: (payload) => {
						replyPayload = payload;
					},
				}) as any
			);
		}
	);

	assert.equal(replyPayload.flags, MessageFlags.Ephemeral);
	assert.match(replyPayload.content, /future date and time/);
});

test('/schedule update changes a recurring schedule from command options', { concurrency: false }, async () => {
	let updateInput: any;
	let replyPayload: any;
	const sentMessages: any[] = [];

	await withRepositoryMocks(
		{
			getConfiguration: async () => ({ timezone: 'UTC' }),
			getActiveSchedules: async () => [],
			getScheduleByName: async () => buildSchedule({ id: 20, name: 'Team meeting', weekdays: '1' }),
			updateScheduleById: async (_id: number, input: any) => {
				updateInput = input;
				return buildSchedule({
					id: 20,
					name: input.name,
					weekdays: input.weekdays,
					time: input.time,
					message: input.message,
					mentionUserIds: input.mentionUserIds,
				});
			},
		},
		async () => {
			await execute(
				buildCommandInteraction({
					subcommand: 'update',
					strings: {
						name: 'Team meeting',
						'new-name': 'Planning',
						days: 'weekdays',
						time: '8:00 PM',
						message: 'Planning starts soon.',
						people: '<@789>',
					},
					client: createClient(sentMessages),
					reply: (payload) => {
						replyPayload = payload;
					},
				}) as any
			);
		}
	);

	assert.deepEqual(updateInput, {
		name: 'Planning',
		time: '8:00 PM',
		message: 'Planning starts soon.',
		mentionUserIds: '789',
		weekdays: '1,2,3,4,5',
		status: scheduleStatuses.ACTIVE,
	});
	assert.equal(getEmbedFields(replyPayload).When, 'weekdays at 8:00 PM');
	assert.equal(getEmbedFields(replyPayload).People, '<@789>');
	assert.equal(sentMessages.length, 1);
	assert.match(sentMessages[0].content, /^<@789>/);
	assert.match(sentMessages[0].content, /Schedule \*\*Planning\*\* was updated: weekdays at 8:00 PM/);
	assert.deepEqual(sentMessages[0].allowedMentions, { users: ['789'] });
});

test('/schedule update leaves people unchanged when people is omitted', { concurrency: false }, async () => {
	let updateInput: any;
	let replyPayload: any;
	const sentMessages: any[] = [];

	await withRepositoryMocks(
		{
			getConfiguration: async () => ({ timezone: 'UTC' }),
			getActiveSchedules: async () => [],
			getScheduleByName: async () => buildSchedule({ id: 23, name: 'Team meeting', weekdays: '1', mentionUserIds: '123,456' }),
			updateScheduleById: async (_id: number, input: any) => {
				updateInput = input;
				return buildSchedule({
					id: 23,
					name: 'Team meeting',
					weekdays: '1',
					time: input.time,
					mentionUserIds: '123,456',
				});
			},
		},
		async () => {
			await execute(
				buildCommandInteraction({
					subcommand: 'update',
					strings: {
						name: 'Team meeting',
						time: '8:00 PM',
					},
					client: createClient(sentMessages),
					reply: (payload) => {
						replyPayload = payload;
					},
				}) as any
			);
		}
	);

	assert.deepEqual(updateInput, {
		time: '8:00 PM',
		status: scheduleStatuses.ACTIVE,
	});
	assert.equal('mentionUserIds' in updateInput, false);
	assert.equal(getEmbedFields(replyPayload).People, '<@123> <@456>');
	assert.equal(sentMessages.length, 1);
	assert.match(sentMessages[0].content, /^<@123> <@456>/);
	assert.match(sentMessages[0].content, /Schedule \*\*Team meeting\*\* was updated: Monday at 8:00 PM/);
	assert.deepEqual(sentMessages[0].allowedMentions, { users: ['123', '456'] });
});

test('/schedule list renders one-time schedules before they fire', { concurrency: false }, async () => {
	let replyPayload: any;

	await withRepositoryMocks(
		{
			getConfiguration: async () => ({ timezone: 'UTC' }),
			getActiveSchedules: async () => [
				buildSchedule({
					type: scheduleTypes.ONE_TIME,
					name: 'Appointment',
					weekdays: null,
					oneTimeDate: '2099-04-20',
					time: '8:05 AM',
					message: 'Appointment starts soon.',
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
	assert.match(fields.Appointment, /2099-04-20 at 8:05 AM/);
	assert.match(fields.Appointment, /People: <@123>/);
	assert.match(fields.Appointment, /Next:/);
});

test('/schedule update changes people from command options', { concurrency: false }, async () => {
	let updateInput: any;
	let replyPayload: any;
	const sentMessages: any[] = [];

	await withRepositoryMocks(
		{
			getConfiguration: async () => ({ timezone: 'UTC' }),
			getActiveSchedules: async () => [],
			getScheduleByName: async () => buildSchedule({ id: 21, name: 'Team meeting', weekdays: '1', mentionUserIds: '123' }),
			updateScheduleById: async (_id: number, input: any) => {
				updateInput = input;
				return buildSchedule({ id: 21, name: 'Team meeting', weekdays: '1', mentionUserIds: input.mentionUserIds });
			},
		},
		async () => {
			await execute(
				buildCommandInteraction({
					subcommand: 'update',
					strings: {
						name: 'Team meeting',
						people: '<@456> <@!789>',
					},
					client: createClient(sentMessages),
					reply: (payload) => {
						replyPayload = payload;
					},
				}) as any
			);
		}
	);

	assert.deepEqual(updateInput, {
		mentionUserIds: '456,789',
		status: scheduleStatuses.ACTIVE,
	});
	assert.equal(getEmbedFields(replyPayload).People, '<@456> <@789>');
	assert.equal(sentMessages.length, 0);
});

test('/schedule update rejects invalid people mentions', { concurrency: false }, async () => {
	let updateCalled = false;
	let replyPayload: any;

	await withRepositoryMocks(
		{
			getScheduleByName: async () => buildSchedule({ id: 22, name: 'Team meeting', weekdays: '1' }),
			updateScheduleById: async () => {
				updateCalled = true;
			},
		},
		async () => {
			await execute(
				buildCommandInteraction({
					subcommand: 'update',
					strings: {
						name: 'Team meeting',
						people: '<@456> nope',
					},
					reply: (payload) => {
						replyPayload = payload;
					},
				}) as any
			);
		}
	);

	assert.equal(updateCalled, false);
	assert.equal(replyPayload.flags, MessageFlags.Ephemeral);
	assert.match(replyPayload.content, /Invalid people list/);
});

test('/schedule update rejects days for one-time schedules', { concurrency: false }, async () => {
	let replyPayload: any;

	await withRepositoryMocks(
		{
			getScheduleByName: async () => buildSchedule({ type: scheduleTypes.ONE_TIME, weekdays: null, oneTimeDate: '2026-04-20' }),
		},
		async () => {
			await execute(
				buildCommandInteraction({
					subcommand: 'update',
					strings: {
						name: 'Appointment',
						days: 'monday',
					},
					reply: (payload) => {
						replyPayload = payload;
					},
				}) as any
			);
		}
	);

	assert.equal(replyPayload.flags, MessageFlags.Ephemeral);
	assert.match(replyPayload.content, /Days can only be updated/);
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
	assert.match(fields['Team meeting'], /People: <@123>/);
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
	const originalCreateSchedule = scheduleRepository.createSchedule;
	const originalGetScheduleByName = scheduleRepository.getScheduleByName;
	const originalUpdateScheduleById = scheduleRepository.updateScheduleById;
	const originalDeleteScheduleByName = scheduleRepository.deleteScheduleByName;

	if (overrides.getConfiguration) {
		configurationRepository.getConfiguration = overrides.getConfiguration;
	}
	if (overrides.getActiveSchedules) {
		scheduleRepository.getActiveSchedules = overrides.getActiveSchedules;
	}
	if (overrides.createSchedule) {
		scheduleRepository.createSchedule = overrides.createSchedule;
	}
	if (overrides.getScheduleByName) {
		scheduleRepository.getScheduleByName = overrides.getScheduleByName;
	}
	if (overrides.updateScheduleById) {
		scheduleRepository.updateScheduleById = overrides.updateScheduleById;
	}
	if (overrides.deleteScheduleByName) {
		scheduleRepository.deleteScheduleByName = overrides.deleteScheduleByName;
	}

	try {
		await callback();
	} finally {
		configurationRepository.getConfiguration = originalGetConfiguration;
		scheduleRepository.getActiveSchedules = originalGetActiveSchedules;
		scheduleRepository.createSchedule = originalCreateSchedule;
		scheduleRepository.getScheduleByName = originalGetScheduleByName;
		scheduleRepository.updateScheduleById = originalUpdateScheduleById;
		scheduleRepository.deleteScheduleByName = originalDeleteScheduleByName;
	}
}

function buildCommandInteraction(options: {
	subcommand: string;
	strings?: Record<string, string>;
	reply?: (payload: any) => void;
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
	};
}

function createClient(sentMessages: any[] = []) {
	const reminderChannel = {
		id: 'reminder-channel',
		name: 'reminders',
		send: async (payload: any) => {
			sentMessages.push(payload);
		},
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
		mentionUserIds: '123',
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
