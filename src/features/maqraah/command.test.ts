import assert from 'node:assert/strict';
import test from 'node:test';
import { ApplicationCommandOptionType, MessageFlags } from 'discord.js';
import { Configuration } from '../../storage/sqlite/repositories/ConfigurationRepository';

process.env.DATABASE_PATH ??= ':memory:';

const { attendanceRepository, configurationRepository, reminderEventsRepository } = require('../../storage/sqlite') as typeof import('../../storage/sqlite');
const { attendanceStatuses } = require('./reminders/attendance') as typeof import('./reminders/attendance');
const { data, handleMaqraahCommand } = require('./command') as typeof import('./command');

test('maqraah command keeps attendance subcommands and exposes progress group', () => {
	const command = data.toJSON() as any;
	const optionNames = command.options.map((option: any) => option.name);

	assert.ok(optionNames.includes('cannot-attend-upcoming-maqraah'));
	assert.ok(optionNames.includes('will-be-late-upcoming-maqraah'));
	assert.ok(optionNames.includes('clear-upcoming-maqraah-status'));

	const cannotAttendSubcommand = command.options.find((option: any) => option.name === 'cannot-attend-upcoming-maqraah');
	assert.deepEqual(
		cannotAttendSubcommand.options.map((option: any) => ({ name: option.name, type: option.type, required: option.required ?? false })),
		[{ name: 'dates', type: ApplicationCommandOptionType.String, required: false }]
	);

	const clearSubcommand = command.options.find((option: any) => option.name === 'clear-upcoming-maqraah-status');
	assert.deepEqual(
		clearSubcommand.options.map((option: any) => ({ name: option.name, type: option.type, required: option.required ?? false })),
		[{ name: 'dates', type: ApplicationCommandOptionType.String, required: false }]
	);

	const progressGroup = command.options.find((option: any) => option.name === 'progress');
	assert.equal(progressGroup.type, ApplicationCommandOptionType.SubcommandGroup);
	assert.deepEqual(
		progressGroup.options.map((option: any) => option.name),
		['update', 'show', 'post-current-page']
	);

	const updateSubcommand = progressGroup.options.find((option: any) => option.name === 'update');
	assert.deepEqual(
		updateSubcommand.options.map((option: any) => option.name),
		['page', 'hadith']
	);
});

test('cannot-attend preregisters the upcoming maqraah for today before reminder time', { concurrency: false }, async () => {
	const replies: any[] = [];
	const upserts: Array<{ sessionId: string; userId: string; status: string; announcedAt: string | null }> = [];

	await withCommandRepositoryMocks(
		{
			getConfiguration: async () => buildConfiguration({ dailyTime: '7:00 PM', timezone: 'UTC' }),
			hasSentEvent: async () => false,
			upsertAttendance: async (sessionId: string, userId: string, status: string, announcedAt: string | null = null) => {
				upserts.push({ sessionId, userId, status, announcedAt });
			},
		},
		async () => {
			await handleMaqraahCommand(
				buildInteraction({
					subcommand: 'cannot-attend-upcoming-maqraah',
					replies,
				}) as any,
				new Date('2026-04-15T18:59:00.000Z')
			);
		}
	);

	assert.deepEqual(upserts, [{ sessionId: '2026-04-15', userId: 'user-1', status: attendanceStatuses.CANNOT_MAKE_IT, announcedAt: null }]);
	assert.deepEqual(replies, [{ content: 'You are marked as unable to attend the upcoming maqraah.', flags: MessageFlags.Ephemeral }]);
});

test('cannot-attend preregisters explicit maqraah dates once in sorted order', { concurrency: false }, async () => {
	const replies: any[] = [];
	const upserts: Array<{ sessionId: string; userId: string; status: string; announcedAt: string | null }> = [];
	const sentEventChecks: string[] = [];

	await withCommandRepositoryMocks(
		{
			getConfiguration: async () => buildConfiguration({ dailyTime: '7:00 PM', timezone: 'UTC' }),
			hasSentEvent: async (sessionId: string) => {
				sentEventChecks.push(sessionId);
				return false;
			},
			upsertAttendance: async (sessionId: string, userId: string, status: string, announcedAt: string | null = null) => {
				upserts.push({ sessionId, userId, status, announcedAt });
			},
		},
		async () => {
			await handleMaqraahCommand(
				buildInteraction({
					subcommand: 'cannot-attend-upcoming-maqraah',
					dates: '2026-04-22, 2026-04-20, 2026-04-22',
					replies,
				}) as any,
				new Date('2026-04-15T18:00:00.000Z')
			);
		}
	);

	assert.deepEqual(sentEventChecks, ['2026-04-20', '2026-04-22']);
	assert.deepEqual(upserts, [
		{ sessionId: '2026-04-20', userId: 'user-1', status: attendanceStatuses.CANNOT_MAKE_IT, announcedAt: null },
		{ sessionId: '2026-04-22', userId: 'user-1', status: attendanceStatuses.CANNOT_MAKE_IT, announcedAt: null },
	]);
	assert.deepEqual(replies, [
		{
			content: 'You are marked as unable to attend these maqraah dates: 2026-04-20, 2026-04-22.',
			flags: MessageFlags.Ephemeral,
		},
	]);
});

test('will-be-late preregisters the next day once reminder time is reached', { concurrency: false }, async () => {
	const replies: any[] = [];
	const upserts: Array<{ sessionId: string; userId: string; status: string; announcedAt: string | null }> = [];

	await withCommandRepositoryMocks(
		{
			getConfiguration: async () => buildConfiguration({ dailyTime: '7:00 PM', timezone: 'UTC' }),
			hasSentEvent: async () => false,
			upsertAttendance: async (sessionId: string, userId: string, status: string, announcedAt: string | null = null) => {
				upserts.push({ sessionId, userId, status, announcedAt });
			},
		},
		async () => {
			await handleMaqraahCommand(
				buildInteraction({
					subcommand: 'will-be-late-upcoming-maqraah',
					replies,
				}) as any,
				new Date('2026-04-15T19:00:00.000Z')
			);
		}
	);

	assert.deepEqual(upserts, [{ sessionId: '2026-04-16', userId: 'user-1', status: attendanceStatuses.LATE, announcedAt: null }]);
	assert.deepEqual(replies, [{ content: 'You are marked as arriving late for the upcoming maqraah.', flags: MessageFlags.Ephemeral }]);
});

test('clear-upcoming-maqraah-status deletes preregistered attendance', { concurrency: false }, async () => {
	const replies: any[] = [];
	const clears: Array<{ sessionId: string; userId: string }> = [];

	await withCommandRepositoryMocks(
		{
			getConfiguration: async () => buildConfiguration({ dailyTime: '7:00 PM', timezone: 'UTC' }),
			hasSentEvent: async () => false,
			deleteAttendance: async (sessionId: string, userId: string) => {
				clears.push({ sessionId, userId });
				return true;
			},
		},
		async () => {
			await handleMaqraahCommand(
				buildInteraction({
					subcommand: 'clear-upcoming-maqraah-status',
					replies,
				}) as any,
				new Date('2026-04-15T18:00:00.000Z')
			);
		}
	);

	assert.deepEqual(clears, [{ sessionId: '2026-04-15', userId: 'user-1' }]);
	assert.deepEqual(replies, [{ content: 'Your upcoming maqraah preregistration was cleared.', flags: MessageFlags.Ephemeral }]);
});

test('clear-upcoming-maqraah-status clears explicit dates and reports missing dates', { concurrency: false }, async () => {
	const replies: any[] = [];
	const clears: Array<{ sessionId: string; userId: string }> = [];

	await withCommandRepositoryMocks(
		{
			getConfiguration: async () => buildConfiguration({ dailyTime: '7:00 PM', timezone: 'UTC' }),
			hasSentEvent: async () => false,
			deleteAttendance: async (sessionId: string, userId: string) => {
				clears.push({ sessionId, userId });
				return sessionId === '2026-04-20';
			},
		},
		async () => {
			await handleMaqraahCommand(
				buildInteraction({
					subcommand: 'clear-upcoming-maqraah-status',
					dates: '2026-04-20, 2026-04-22',
					replies,
				}) as any,
				new Date('2026-04-15T18:00:00.000Z')
			);
		}
	);

	assert.deepEqual(clears, [
		{ sessionId: '2026-04-20', userId: 'user-1' },
		{ sessionId: '2026-04-22', userId: 'user-1' },
	]);
	assert.deepEqual(replies, [
		{
			content: 'Cleared your maqraah preregistration for: 2026-04-20.\nNo saved preregistration found for: 2026-04-22.',
			flags: MessageFlags.Ephemeral,
		},
	]);
});

test('maqraah preregistration refuses when pre-reminders are disabled', { concurrency: false }, async () => {
	const replies: any[] = [];

	await withCommandRepositoryMocks(
		{
			getConfiguration: async () => buildConfiguration({ preReminderEnabled: 0 }),
		},
		async () => {
			await handleMaqraahCommand(
				buildInteraction({
					subcommand: 'cannot-attend-upcoming-maqraah',
					replies,
				}) as any,
				new Date('2026-04-15T18:00:00.000Z')
			);
		}
	);

	assert.deepEqual(replies, [
		{
			content: 'Pre-reminders are disabled right now, so preregistering for the upcoming maqraah is unavailable.',
			flags: MessageFlags.Ephemeral,
		},
	]);
});

test('maqraah preregistration rejects invalid explicit date lists before writing', { concurrency: false }, async () => {
	const cases = [
		{ dates: '2026-02-31', message: /Invalid date/ },
		{ dates: '2026-04-20,', message: /comma-separated/ },
		{ dates: Array.from({ length: 31 }, (_, index) => `2026-05-${String(index + 1).padStart(2, '0')}`).join(', '), message: /up to 30/ },
		{ dates: '2026-04-14', message: /on or after the upcoming maqraah date \(2026-04-15\)/ },
	];

	for (const testCase of cases) {
		const replies: any[] = [];
		let upsertCalls = 0;
		let sentEventChecks = 0;

		await withCommandRepositoryMocks(
			{
				getConfiguration: async () => buildConfiguration({ dailyTime: '7:00 PM', timezone: 'UTC' }),
				hasSentEvent: async () => {
					sentEventChecks += 1;
					return false;
				},
				upsertAttendance: async () => {
					upsertCalls += 1;
				},
			},
			async () => {
				await handleMaqraahCommand(
					buildInteraction({
						subcommand: 'cannot-attend-upcoming-maqraah',
						dates: testCase.dates,
						replies,
					}) as any,
					new Date('2026-04-15T18:00:00.000Z')
				);
			}
		);

		assert.equal(upsertCalls, 0);
		assert.equal(sentEventChecks, 0);
		assert.equal(replies.length, 1);
		assert.match(replies[0].content, testCase.message);
		assert.equal(replies[0].flags, MessageFlags.Ephemeral);
	}
});

test('maqraah preregistration refuses after the pre reminder already went out', { concurrency: false }, async () => {
	const replies: any[] = [];

	await withCommandRepositoryMocks(
		{
			getConfiguration: async () => buildConfiguration({ dailyTime: '7:00 PM', timezone: 'UTC' }),
			hasSentEvent: async () => true,
		},
		async () => {
			await handleMaqraahCommand(
				buildInteraction({
					subcommand: 'cannot-attend-upcoming-maqraah',
					replies,
				}) as any,
				new Date('2026-04-15T18:00:00.000Z')
			);
		}
	);

	assert.deepEqual(replies, [
		{
			content: 'The pre-maqraah reminder for that session has already been sent. Please use the reminder buttons instead.',
			flags: MessageFlags.Ephemeral,
		},
	]);
});

test('explicit maqraah dates refuse when any selected pre reminder already went out', { concurrency: false }, async () => {
	const replies: any[] = [];
	let upsertCalls = 0;
	const sentEventChecks: string[] = [];

	await withCommandRepositoryMocks(
		{
			getConfiguration: async () => buildConfiguration({ dailyTime: '7:00 PM', timezone: 'UTC' }),
			hasSentEvent: async (sessionId: string) => {
				sentEventChecks.push(sessionId);
				return sessionId === '2026-04-22';
			},
			upsertAttendance: async () => {
				upsertCalls += 1;
			},
		},
		async () => {
			await handleMaqraahCommand(
				buildInteraction({
					subcommand: 'cannot-attend-upcoming-maqraah',
					dates: '2026-04-20, 2026-04-22',
					replies,
				}) as any,
				new Date('2026-04-15T18:00:00.000Z')
			);
		}
	);

	assert.deepEqual(sentEventChecks, ['2026-04-20', '2026-04-22']);
	assert.equal(upsertCalls, 0);
	assert.deepEqual(replies, [
		{
			content: 'The pre-maqraah reminder has already been sent for: 2026-04-22. Please use the reminder buttons instead.',
			flags: MessageFlags.Ephemeral,
		},
	]);
});

async function withCommandRepositoryMocks(
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

function buildInteraction(options: { subcommand: string; replies: any[]; dates?: string | null }): Record<string, unknown> {
	return {
		options: {
			getSubcommand: () => options.subcommand,
			getString: (optionName: string) => {
				if (optionName === 'dates') {
					return options.dates ?? null;
				}

				return null;
			},
		},
		user: {
			id: 'user-1',
			username: 'User One',
		},
		guildId: 'guild-1',
		channelId: 'channel-1',
		reply: async (payload: any) => {
			options.replies.push(payload);
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
		...configuration,
	};
}
