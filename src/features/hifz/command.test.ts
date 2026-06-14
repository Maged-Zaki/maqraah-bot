import assert from 'node:assert/strict';
import test from 'node:test';
import { ApplicationCommandOptionType, MessageFlags } from 'discord.js';
import type { Configuration } from '../../storage/sqlite/repositories/ConfigurationRepository';

process.env.DATABASE_PATH ??= ':memory:';

const { attendanceRepository, configurationRepository, reminderEventsRepository } = require('../../storage/sqlite') as typeof import('../../storage/sqlite');
const { hifzAttendanceStatuses } = require('./reminders/attendance') as typeof import('./reminders/attendance');
const { data, handleHifzCommand } = require('./command') as typeof import('./command');

test('hifz command keeps attendance subcommands and exposes progress group', () => {
	const command = data.toJSON() as any;
	const optionNames = command.options.map((option: any) => option.name);

	assert.ok(optionNames.includes('cannot-attend-upcoming-hifz'));
	assert.ok(optionNames.includes('will-be-late-upcoming-hifz'));
	assert.ok(optionNames.includes('clear-upcoming-hifz-status'));

	const progressGroup = command.options.find((option: any) => option.name === 'progress');
	assert.equal(progressGroup.type, ApplicationCommandOptionType.SubcommandGroup);
	assert.deepEqual(
		progressGroup.options.map((option: any) => option.name),
		['update', 'show', 'post-current-page']
	);

	const updateSubcommand = progressGroup.options.find((option: any) => option.name === 'update');
	assert.deepEqual(
		updateSubcommand.options.map((option: any) => option.name),
		['page']
	);
});

test('cannot-attend preregisters the upcoming hifz for today before reminder time', { concurrency: false }, async () => {
	const replies: any[] = [];
	const upserts: Array<{ sessionId: string; userId: string; status: string }> = [];

	await withMocks(
		{
			getConfiguration: async () => buildConfiguration({ hifzTime: '7:00 PM', timezone: 'UTC' }),
			hasSentEvent: async () => false,
			upsertAttendance: async (sessionId: string, userId: string, status: string) => {
				upserts.push({ sessionId, userId, status });
			},
		},
		async () => {
			await handleHifzCommand(buildInteraction('cannot-attend-upcoming-hifz', replies) as any, new Date('2026-04-15T18:59:00.000Z'));
		}
	);

	assert.deepEqual(upserts, [{ sessionId: 'hifz-2026-04-15', userId: 'user-1', status: hifzAttendanceStatuses.CANNOT_MAKE_IT }]);
	assert.deepEqual(replies, [{ content: 'You are marked as unable to attend the upcoming hifz.', flags: MessageFlags.Ephemeral }]);
});

test('will-be-late preregisters the next day once reminder time is reached', { concurrency: false }, async () => {
	const replies: any[] = [];
	const upserts: Array<{ sessionId: string; userId: string; status: string }> = [];

	await withMocks(
		{
			getConfiguration: async () => buildConfiguration({ hifzTime: '7:00 PM', timezone: 'UTC' }),
			hasSentEvent: async () => false,
			upsertAttendance: async (sessionId: string, userId: string, status: string) => {
				upserts.push({ sessionId, userId, status });
			},
		},
		async () => {
			await handleHifzCommand(buildInteraction('will-be-late-upcoming-hifz', replies) as any, new Date('2026-04-15T19:00:00.000Z'));
		}
	);

	assert.deepEqual(upserts, [{ sessionId: 'hifz-2026-04-16', userId: 'user-1', status: hifzAttendanceStatuses.LATE }]);
	assert.deepEqual(replies, [{ content: 'You are marked as arriving late for the upcoming hifz.', flags: MessageFlags.Ephemeral }]);
});

test('clear-status clears an existing preregistration', { concurrency: false }, async () => {
	const replies: any[] = [];

	await withMocks(
		{
			getConfiguration: async () => buildConfiguration({ hifzTime: '7:00 PM', timezone: 'UTC' }),
			hasSentEvent: async () => false,
			deleteAttendance: async () => true,
		},
		async () => {
			await handleHifzCommand(buildInteraction('clear-upcoming-hifz-status', replies) as any, new Date('2026-04-15T18:00:00.000Z'));
		}
	);

	assert.deepEqual(replies, [{ content: 'Your upcoming hifz preregistration was cleared.', flags: MessageFlags.Ephemeral }]);
});

test('clear-status reports when no preregistration exists', { concurrency: false }, async () => {
	const replies: any[] = [];

	await withMocks(
		{
			getConfiguration: async () => buildConfiguration({ hifzTime: '7:00 PM', timezone: 'UTC' }),
			hasSentEvent: async () => false,
			deleteAttendance: async () => false,
		},
		async () => {
			await handleHifzCommand(buildInteraction('clear-upcoming-hifz-status', replies) as any, new Date('2026-04-15T18:00:00.000Z'));
		}
	);

	assert.deepEqual(replies, [{ content: 'You do not have a saved upcoming hifz preregistration.', flags: MessageFlags.Ephemeral }]);
});

test('cannot-attend is refused once the pre reminder already went out', { concurrency: false }, async () => {
	const replies: any[] = [];
	let upsertCalls = 0;

	await withMocks(
		{
			getConfiguration: async () => buildConfiguration({ hifzTime: '7:00 PM', timezone: 'UTC' }),
			hasSentEvent: async () => true,
			upsertAttendance: async () => {
				upsertCalls += 1;
			},
		},
		async () => {
			await handleHifzCommand(buildInteraction('cannot-attend-upcoming-hifz', replies) as any, new Date('2026-04-15T18:00:00.000Z'));
		}
	);

	assert.equal(upsertCalls, 0);
	assert.deepEqual(replies, [
		{
			content: 'The pre-hifz reminder for that session has already been sent. Please use the reminder buttons instead.',
			flags: MessageFlags.Ephemeral,
		},
	]);
});

test('cannot-attend is refused when pre-reminders are disabled', { concurrency: false }, async () => {
	const replies: any[] = [];
	let upsertCalls = 0;

	await withMocks(
		{
			getConfiguration: async () => buildConfiguration({ hifzTime: '7:00 PM', timezone: 'UTC', hifzPreReminderEnabled: 0 }),
			hasSentEvent: async () => false,
			upsertAttendance: async () => {
				upsertCalls += 1;
			},
		},
		async () => {
			await handleHifzCommand(buildInteraction('cannot-attend-upcoming-hifz', replies) as any, new Date('2026-04-15T18:00:00.000Z'));
		}
	);

	assert.equal(upsertCalls, 0);
	assert.deepEqual(replies, [
		{
			content: 'Pre-reminders are disabled right now, so preregistering for the upcoming hifz is unavailable.',
			flags: MessageFlags.Ephemeral,
		},
	]);
});

async function withMocks(
	overrides: Partial<
		Pick<typeof configurationRepository, 'getConfiguration'> &
			Pick<typeof reminderEventsRepository, 'hasSentEvent'> &
			Pick<typeof attendanceRepository, 'upsertAttendance' | 'deleteAttendance'>
	>,
	callback: () => Promise<void>
): Promise<void> {
	const originalGetConfiguration = configurationRepository.getConfiguration;
	const originalHasSentEvent = reminderEventsRepository.hasSentEvent;
	const originalUpsertAttendance = attendanceRepository.upsertAttendance;
	const originalDeleteAttendance = attendanceRepository.deleteAttendance;

	if (overrides.getConfiguration) {
		configurationRepository.getConfiguration = overrides.getConfiguration;
	}
	if (overrides.hasSentEvent) {
		reminderEventsRepository.hasSentEvent = overrides.hasSentEvent;
	}
	if (overrides.upsertAttendance) {
		attendanceRepository.upsertAttendance = overrides.upsertAttendance;
	}
	if (overrides.deleteAttendance) {
		attendanceRepository.deleteAttendance = overrides.deleteAttendance;
	}

	try {
		await callback();
	} finally {
		configurationRepository.getConfiguration = originalGetConfiguration;
		reminderEventsRepository.hasSentEvent = originalHasSentEvent;
		attendanceRepository.upsertAttendance = originalUpsertAttendance;
		attendanceRepository.deleteAttendance = originalDeleteAttendance;
	}
}

function buildInteraction(subcommand: string, replies: any[]): Record<string, unknown> {
	return {
		options: {
			getSubcommand: () => subcommand,
			getSubcommandGroup: () => null,
		},
		user: {
			id: 'user-1',
			username: 'User One',
		},
		guildId: 'guild-1',
		channelId: 'channel-1',
		reply: async (payload: any) => {
			replies.push(payload);
		},
	};
}

function buildConfiguration(configuration: Partial<Configuration>): Configuration {
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
		hifzTime: '7:00 PM',
		hifzReminderEnabled: 1,
		hifzPreReminderEnabled: 1,
		hifzPreReminderOffsetMinutes: 5,
		...configuration,
	};
}
