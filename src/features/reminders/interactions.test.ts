import assert from 'node:assert/strict';
import test from 'node:test';
import { Attendance } from '../../storage/sqlite/repositories/AttendanceRepository';

process.env.DATABASE_PATH ??= ':memory:';

const { attendanceRepository } = require('../../storage/sqlite') as typeof import('../../storage/sqlite');
const { buildReminderActionCustomId, reminderActions } = require('./components') as typeof import('./components');
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
					onSend: (content) => {
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
					onSend: (content) => {
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

function buildInteraction(options: {
	customId: string;
	onDeferUpdate?: () => void;
	onSend?: (content: string) => void;
}): Record<string, unknown> {
	return {
		customId: options.customId,
		user: {
			id: 'user-1',
			username: 'User One',
		},
		guildId: 'guild-1',
		channelId: 'channel-1',
		message: {
			channel: {
				isSendable: () => true,
				send: async ({ content }: { content: string }) => {
					options.onSend?.(content);
				},
			},
		},
		deferUpdate: async () => {
			options.onDeferUpdate?.();
		},
		reply: async () => {},
		followUp: async () => {},
		update: async () => {},
		replied: false,
		deferred: false,
	};
}
