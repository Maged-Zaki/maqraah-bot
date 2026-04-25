import assert from 'node:assert/strict';
import test from 'node:test';
import { Attendance } from '../../../storage/sqlite/repositories/AttendanceRepository';
import type { Progress, QuranProgressUpdateResult } from '../../../storage/sqlite/repositories/ProgressRepository';

process.env.DATABASE_PATH ??= ':memory:';

const { attendanceRepository, progressRepository } = require('../../../storage/sqlite') as typeof import('../../../storage/sqlite');
const {
	buildNextQuranPageActionCustomId,
	buildReminderActionCustomId,
	parseReminderActionCustomId,
	reminderActions,
} = require('./components') as typeof import('./components');
const { handleReminderButtonInteraction } = require('./interactions') as typeof import('./interactions');

test('same attendance status does not post a duplicate message once it was already announced', { concurrency: false }, async () => {
	const sentMessages: string[] = [];
	let upsertCalled = false;
	let markCalled = false;
	let deferred = false;

	await withAttendanceRepositoryMocks(
		{
			getAttendance: async () =>
				buildAttendance({
					status: 'late',
					announcedAt: '2026-04-15T10:05:00.000Z',
				}),
			upsertAttendance: async () => {
				upsertCalled = true;
			},
			markAttendanceAnnounced: async () => {
				markCalled = true;
			},
		},
		async () => {
			const handled = await handleReminderButtonInteraction(
				buildInteraction({
					customId: buildReminderActionCustomId(reminderActions.JOINING_SHORTLY, '2026-04-15'),
					onDeferUpdate: () => {
						deferred = true;
					},
					onSend: ({ content }) => {
						sentMessages.push(content);
					},
				}) as any
			);

			assert.equal(handled, true);
		}
	);

	assert.equal(deferred, true);
	assert.equal(upsertCalled, false);
	assert.equal(markCalled, false);
	assert.deepEqual(sentMessages, []);
});

test('changing attendance status posts the new public message and marks it announced', { concurrency: false }, async () => {
	const sentMessages: string[] = [];
	const upserts: Array<{ sessionId: string; userId: string; status: string; announcedAt: string | null }> = [];
	const markedAttendance: Array<{ sessionId: string; userId: string }> = [];

	await withAttendanceRepositoryMocks(
		{
			getAttendance: async () =>
				buildAttendance({
					status: 'late',
					announcedAt: '2026-04-15T10:05:00.000Z',
				}),
			upsertAttendance: async (sessionId: string, userId: string, status: string, announcedAt: string | null = null) => {
				upserts.push({ sessionId, userId, status, announcedAt });
			},
			markAttendanceAnnounced: async (sessionId: string, userId: string) => {
				markedAttendance.push({ sessionId, userId });
			},
		},
		async () => {
			const handled = await handleReminderButtonInteraction(
				buildInteraction({
					customId: buildReminderActionCustomId(reminderActions.CANNOT_MAKE_IT, '2026-04-15'),
					onSend: ({ content }) => {
						sentMessages.push(content);
					},
				}) as any
			);

			assert.equal(handled, true);
		}
	);

	assert.deepEqual(upserts, [{ sessionId: '2026-04-15', userId: 'user-1', status: 'cannot_make_it', announcedAt: null }]);
	assert.deepEqual(sentMessages, ['<@user-1> مش هيقدر يحضر المقراة النهارده.']);
	assert.deepEqual(markedAttendance, [{ sessionId: '2026-04-15', userId: 'user-1' }]);
});

test('next quran page button updates progress, removes the old button, and sends the next current page', { concurrency: false }, async () => {
	const quranUpdates: number[] = [];
	const updatePayloads: any[] = [];
	const sentPayloads: any[] = [];

	await withProgressRepositoryMocks(
		{
			getProgress: async () => buildProgress({ currentPage: 12 }),
			updateQuranProgress: async (currentPage: number) => {
				quranUpdates.push(currentPage);
				return buildQuranProgressUpdateResult({
					previousProgress: buildProgress({ currentPage: 12 }),
					progress: buildProgress({ currentPage }),
				});
			},
		},
		async () => {
			const handled = await handleReminderButtonInteraction(
				buildInteraction({
					customId: buildNextQuranPageActionCustomId('2026-04-15', 12),
					onUpdate: (payload) => {
						updatePayloads.push(payload);
					},
					onSend: (payload) => {
						sentPayloads.push(payload);
					},
				}) as any
			);

			assert.equal(handled, true);
		}
	);

	assert.deepEqual(quranUpdates, [13]);
	assert.deepEqual(updatePayloads, [{ components: [] }]);
	assert.equal(sentPayloads[0]?.content, 'Current page: **13**');
	const row = sentPayloads[0]?.components?.[0].toJSON() as any;
	assert.deepEqual(parseReminderActionCustomId(row.components[0].custom_id), {
		action: reminderActions.NEXT_QURAN_PAGE,
		sessionId: '2026-04-15',
		page: 13,
	});
});

test('stale next quran page buttons do not move progress backward', { concurrency: false }, async () => {
	const quranUpdates: number[] = [];
	const updatePayloads: any[] = [];
	const followUpPayloads: any[] = [];
	const sentPayloads: any[] = [];

	await withProgressRepositoryMocks(
		{
			getProgress: async () => buildProgress({ currentPage: 14 }),
			updateQuranProgress: async (currentPage: number) => {
				quranUpdates.push(currentPage);
				return buildQuranProgressUpdateResult({
					previousProgress: buildProgress({ currentPage: 14 }),
					progress: buildProgress({ currentPage }),
				});
			},
		},
		async () => {
			const handled = await handleReminderButtonInteraction(
				buildInteraction({
					customId: buildNextQuranPageActionCustomId('2026-04-15', 13),
					onUpdate: (payload) => {
						updatePayloads.push(payload);
					},
					onFollowUp: (payload) => {
						followUpPayloads.push(payload);
					},
					onSend: (payload) => {
						sentPayloads.push(payload);
					},
				}) as any
			);

			assert.equal(handled, true);
		}
	);

	assert.deepEqual(quranUpdates, []);
	assert.deepEqual(updatePayloads, [{ components: [] }]);
	assert.deepEqual(sentPayloads, []);
	assert.match(followUpPayloads[0]?.content, /Current page is \*\*14\*\*/);
});

test('next quran page button wraps the prompt to page one after page 604', { concurrency: false }, async () => {
	const previousChannelId = process.env.CHANNEL_ID;
	process.env.CHANNEL_ID = 'reminder-channel';
	const client = createClient();
	const quranUpdates: number[] = [];
	const sentPayloads: any[] = [];

	await withProgressRepositoryMocks(
		{
			getProgress: async () => buildProgress({ currentPage: 604 }),
			updateQuranProgress: async (currentPage: number) => {
				quranUpdates.push(currentPage);
				return buildQuranProgressUpdateResult({
					previousProgress: buildProgress({ currentPage: 604 }),
					progress: buildProgress({ currentPage, khatmahCycleCount: 1 }),
					completedKhatmah: true,
				});
			},
		},
		async () => {
			const handled = await handleReminderButtonInteraction(
				buildInteraction({
					customId: buildNextQuranPageActionCustomId('2026-04-15', 604),
					onSend: (payload) => {
						sentPayloads.push(payload);
					},
					client,
				}) as any
			);

			assert.equal(handled, true);
		}
	);

	restoreEnv('CHANNEL_ID', previousChannelId);

	assert.deepEqual(quranUpdates, [1]);
	assert.equal(sentPayloads[0]?.content, 'Current page: **1**');
	const row = sentPayloads[0]?.components?.[0].toJSON() as any;
	assert.deepEqual(parseReminderActionCustomId(row.components[0].custom_id), {
		action: reminderActions.NEXT_QURAN_PAGE,
		sessionId: '2026-04-15',
		page: 1,
	});
	const reminderChannel = client.channels.cache.get('reminder-channel');
	assert.equal(reminderChannel?.sentMessages[0]?.content, 'Alhamdulillah! The maqraah has completed khatmah #1.');
});

async function withAttendanceRepositoryMocks(
	overrides: Partial<Pick<typeof attendanceRepository, 'getAttendance' | 'upsertAttendance' | 'markAttendanceAnnounced'>>,
	callback: () => Promise<void>
): Promise<void> {
	const originalGetAttendance = attendanceRepository.getAttendance;
	const originalUpsertAttendance = attendanceRepository.upsertAttendance;
	const originalMarkAttendanceAnnounced = attendanceRepository.markAttendanceAnnounced;

	if (overrides.getAttendance) {
		attendanceRepository.getAttendance = overrides.getAttendance;
	}

	if (overrides.upsertAttendance) {
		attendanceRepository.upsertAttendance = overrides.upsertAttendance;
	}

	if (overrides.markAttendanceAnnounced) {
		attendanceRepository.markAttendanceAnnounced = overrides.markAttendanceAnnounced;
	}

	try {
		await callback();
	} finally {
		attendanceRepository.getAttendance = originalGetAttendance;
		attendanceRepository.upsertAttendance = originalUpsertAttendance;
		attendanceRepository.markAttendanceAnnounced = originalMarkAttendanceAnnounced;
	}
}

async function withProgressRepositoryMocks(
	overrides: Partial<Pick<typeof progressRepository, 'getProgress' | 'updateQuranProgress'>>,
	callback: () => Promise<void>
): Promise<void> {
	const originalGetProgress = progressRepository.getProgress;
	const originalUpdateQuranProgress = progressRepository.updateQuranProgress;

	if (overrides.getProgress) {
		progressRepository.getProgress = overrides.getProgress;
	}

	if (overrides.updateQuranProgress) {
		progressRepository.updateQuranProgress = overrides.updateQuranProgress;
	}

	try {
		await callback();
	} finally {
		progressRepository.getProgress = originalGetProgress;
		progressRepository.updateQuranProgress = originalUpdateQuranProgress;
	}
}

function buildAttendance(attendance: Partial<Attendance>): Attendance {
	return {
		id: 1,
		sessionId: '2026-04-15',
		userId: 'user-1',
		status: 'late',
		updatedAt: '2026-04-15T10:00:00.000Z',
		announcedAt: null,
		...attendance,
	};
}

function buildProgress(progress: Partial<Progress>): Progress {
	return {
		currentPage: 1,
		currentHadith: 1,
		khatmahCycleCount: 0,
		...progress,
	};
}

function buildQuranProgressUpdateResult(result: Partial<QuranProgressUpdateResult>): QuranProgressUpdateResult {
	return {
		previousProgress: buildProgress({}),
		progress: buildProgress({}),
		wrapped: false,
		completedKhatmah: false,
		pagesAdvanced: 0,
		historyRecorded: false,
		correctedBackward: false,
		...result,
	};
}

function buildInteraction(options: {
	customId: string;
	client?: any;
	onDeferUpdate?: () => void;
	onFollowUp?: (payload: any) => void;
	onSend?: (payload: any) => void;
	onUpdate?: (payload: any) => void;
}): Record<string, unknown> {
	return {
		customId: options.customId,
		user: {
			id: 'user-1',
			username: 'User One',
		},
		guildId: 'guild-1',
		channelId: 'channel-1',
		client: options.client,
		message: {
			channel: {
				isSendable: () => true,
				send: async (payload: any) => {
					options.onSend?.(payload);
				},
			},
		},
		deferUpdate: async () => {
			options.onDeferUpdate?.();
		},
		reply: async () => {},
		followUp: async (payload: any) => {
			options.onFollowUp?.(payload);
		},
		update: async (payload: any) => {
			options.onUpdate?.(payload);
		},
		replied: false,
		deferred: false,
	};
}

function createClient() {
	const reminderChannel = {
		sentMessages: [] as any[],
		send: async (payload: any) => {
			reminderChannel.sentMessages.push(payload);
		},
	};

	return {
		channels: {
			cache: new Map([['reminder-channel', reminderChannel]]),
		},
	};
}

function restoreEnv(name: string, value: string | undefined): void {
	if (value === undefined) {
		delete process.env[name];
	} else {
		process.env[name] = value;
	}
}
