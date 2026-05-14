import assert from 'node:assert/strict';
import test from 'node:test';
import { Attendance } from '../../../storage/sqlite/repositories/AttendanceRepository';
import type { Progress } from '../../../storage/sqlite/repositories/ProgressRepository';

process.env.DATABASE_PATH ??= ':memory:';

const { attendanceAnnouncementMessageRepository, attendanceRepository, progressRepository } = require('../../../storage/sqlite') as typeof import('../../../storage/sqlite');
const {
	buildNextQuranPageActionCustomId,
	buildPreviousQuranPageActionCustomId,
	buildReminderActionCustomId,
	parseReminderActionCustomId,
	reminderActions,
} = require('./components') as typeof import('./components');
const { handleReminderButtonInteraction } = require('./interactions') as typeof import('./interactions');
const { buildQuranPageImageUrl, buildQuranPageReadUrl } = require('../../../shared/quran/pageImages') as typeof import('../../../shared/quran/pageImages');

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

test('changing attendance status edits the shared attendance message and marks it announced', { concurrency: false }, async () => {
	const sentMessages: string[] = [];
	const editedMessages: string[] = [];
	const upserts: Array<{ sessionId: string; userId: string; status: string; announcedAt: string | null }> = [];
	const markedAttendance: Array<{ sessionId: string; userId: string }> = [];
	const storedMessages: Array<{ sessionId: string; channelId: string; messageId: string }> = [];

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
			getAttendanceBySessionId: async () => [buildAttendance({ status: 'cannot_make_it', announcedAt: null })],
			markAttendanceAnnounced: async (sessionId: string, userId: string) => {
				markedAttendance.push({ sessionId, userId });
			},
			getMessageBySessionId: async () => ({
				sessionId: '2026-04-15',
				channelId: 'channel-1',
				messageId: 'attendance-message-1',
				updatedAt: '2026-04-15T10:05:00.000Z',
			}),
			upsertMessage: async (sessionId: string, channelId: string, messageId: string) => {
				storedMessages.push({ sessionId, channelId, messageId });
			},
		},
		async () => {
			const handled = await handleReminderButtonInteraction(
				buildInteraction({
					customId: buildReminderActionCustomId(reminderActions.CANNOT_MAKE_IT, '2026-04-15'),
					onEdit: ({ content }) => {
						editedMessages.push(content);
					},
					onSend: ({ content }) => {
						sentMessages.push(content);
					},
				}) as any
			);

			assert.equal(handled, true);
		}
	);

	assert.deepEqual(upserts, [{ sessionId: '2026-04-15', userId: 'user-1', status: 'cannot_make_it', announcedAt: null }]);
	assert.deepEqual(sentMessages, []);
	assert.deepEqual(editedMessages, ['**تحديثات الحضور**\n> <@user-1> مش هيقدر يحضر المقراة النهارده.']);
	assert.deepEqual(storedMessages, [{ sessionId: '2026-04-15', channelId: 'channel-1', messageId: 'attendance-message-1' }]);
	assert.deepEqual(markedAttendance, [{ sessionId: '2026-04-15', userId: 'user-1' }]);
});

test('later attendance button edits the existing session message to include everyone', { concurrency: false }, async () => {
	const sentMessages: string[] = [];
	const editedMessages: string[] = [];
	const upserts: Array<{ sessionId: string; userId: string; status: string; announcedAt: string | null }> = [];
	const markedAttendance: Array<{ sessionId: string; userId: string }> = [];

	await withAttendanceRepositoryMocks(
		{
			getAttendance: async () => null,
			upsertAttendance: async (sessionId: string, userId: string, status: string, announcedAt: string | null = null) => {
				upserts.push({ sessionId, userId, status, announcedAt });
			},
			getAttendanceBySessionId: async () => [
				buildAttendance({
					userId: 'user-1',
					status: 'cannot_make_it',
					updatedAt: '2026-04-15T10:00:00.000Z',
					announcedAt: '2026-04-15T10:05:00.000Z',
				}),
				buildAttendance({
					userId: 'user-2',
					status: 'late',
					updatedAt: '2026-04-15T10:06:00.000Z',
					announcedAt: null,
				}),
			],
			markAttendanceAnnounced: async (sessionId: string, userId: string) => {
				markedAttendance.push({ sessionId, userId });
			},
			getMessageBySessionId: async () => ({
				sessionId: '2026-04-15',
				channelId: 'channel-1',
				messageId: 'attendance-message-1',
				updatedAt: '2026-04-15T10:05:00.000Z',
			}),
			upsertMessage: async () => {},
		},
		async () => {
			const handled = await handleReminderButtonInteraction(
				buildInteraction({
					customId: buildReminderActionCustomId(reminderActions.JOINING_SHORTLY, '2026-04-15'),
					userId: 'user-2',
					username: 'User Two',
					onEdit: ({ content }) => {
						editedMessages.push(content);
					},
					onSend: ({ content }) => {
						sentMessages.push(content);
					},
				}) as any
			);

			assert.equal(handled, true);
		}
	);

	assert.deepEqual(upserts, [{ sessionId: '2026-04-15', userId: 'user-2', status: 'late', announcedAt: null }]);
	assert.deepEqual(sentMessages, []);
	assert.deepEqual(editedMessages, [
		'**تحديثات الحضور**\n> <@user-1> مش هيقدر يحضر المقراة النهارده.\n> <@user-2> هيتأخر شوية عن المقراة.',
	]);
	assert.deepEqual(markedAttendance, [{ sessionId: '2026-04-15', userId: 'user-2' }]);
});

test('attendance button sends one replacement message when the stored message was deleted', { concurrency: false }, async () => {
	const sentMessages: string[] = [];
	const editedMessages: string[] = [];
	const storedMessages: Array<{ sessionId: string; channelId: string; messageId: string }> = [];
	const markedAttendance: Array<{ sessionId: string; userId: string }> = [];

	await withAttendanceRepositoryMocks(
		{
			getAttendance: async () => null,
			upsertAttendance: async () => {},
			getAttendanceBySessionId: async () => [buildAttendance({ status: 'late', announcedAt: null })],
			markAttendanceAnnounced: async (sessionId: string, userId: string) => {
				markedAttendance.push({ sessionId, userId });
			},
			getMessageBySessionId: async () => ({
				sessionId: '2026-04-15',
				channelId: 'channel-1',
				messageId: 'deleted-message-1',
				updatedAt: '2026-04-15T10:05:00.000Z',
			}),
			upsertMessage: async (sessionId: string, channelId: string, messageId: string) => {
				storedMessages.push({ sessionId, channelId, messageId });
			},
		},
		async () => {
			const handled = await handleReminderButtonInteraction(
				buildInteraction({
					customId: buildReminderActionCustomId(reminderActions.JOINING_SHORTLY, '2026-04-15'),
					sentMessageId: 'replacement-message-1',
					onFetch: async () => {
						throw { code: 10008, message: 'Unknown Message' };
					},
					onEdit: ({ content }) => {
						editedMessages.push(content);
					},
					onSend: ({ content }) => {
						sentMessages.push(content);
					},
				}) as any
			);

			assert.equal(handled, true);
		}
	);

	assert.deepEqual(editedMessages, []);
	assert.deepEqual(sentMessages, ['**تحديثات الحضور**\n> <@user-1> هيتأخر شوية عن المقراة.']);
	assert.deepEqual(storedMessages, [{ sessionId: '2026-04-15', channelId: 'channel-1', messageId: 'replacement-message-1' }]);
	assert.deepEqual(markedAttendance, [{ sessionId: '2026-04-15', userId: 'user-1' }]);
});

test('next quran page button updates progress, deletes the old message, and sends the next current page', { concurrency: false }, async () => {
	const quranUpdates: number[] = [];
	const updatePayloads: any[] = [];
	const sentPayloads: any[] = [];
	let deferred = false;
	let deleted = false;

	await withProgressRepositoryMocks(
		{
			getProgress: async () => buildProgress({ currentPage: 12 }),
			updateQuranProgress: async (currentPage: number) => {
				quranUpdates.push(currentPage);
			},
		},
		async () => {
			const handled = await handleReminderButtonInteraction(
				buildInteraction({
					customId: buildNextQuranPageActionCustomId('2026-04-15', 12),
					onDeferUpdate: () => {
						deferred = true;
					},
					onDelete: () => {
						deleted = true;
					},
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
	assert.equal(deferred, true);
	assert.equal(deleted, true);
	assert.deepEqual(updatePayloads, []);
	assert.equal(sentPayloads.length, 1);
	assertCurrentPagePrompt(sentPayloads[0], '2026-04-15', 13);
});

test('previous quran page button updates progress, deletes the old message, and sends the previous current page', { concurrency: false }, async () => {
	const quranUpdates: number[] = [];
	const updatePayloads: any[] = [];
	const sentPayloads: any[] = [];
	let deferred = false;
	let deleted = false;

	await withProgressRepositoryMocks(
		{
			getProgress: async () => buildProgress({ currentPage: 13 }),
			updateQuranProgress: async (currentPage: number) => {
				quranUpdates.push(currentPage);
			},
		},
		async () => {
			const handled = await handleReminderButtonInteraction(
				buildInteraction({
					customId: buildPreviousQuranPageActionCustomId('2026-04-15', 13),
					onDeferUpdate: () => {
						deferred = true;
					},
					onDelete: () => {
						deleted = true;
					},
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

	assert.deepEqual(quranUpdates, [12]);
	assert.equal(deferred, true);
	assert.equal(deleted, true);
	assert.deepEqual(updatePayloads, []);
	assert.equal(sentPayloads.length, 1);
	assertCurrentPagePrompt(sentPayloads[0], '2026-04-15', 12);
});

test('stale next quran page buttons do not move progress backward', { concurrency: false }, async () => {
	const quranUpdates: number[] = [];
	const updatePayloads: any[] = [];
	const followUpPayloads: any[] = [];
	const sentPayloads: any[] = [];
	let deferred = false;
	let deleted = false;

	await withProgressRepositoryMocks(
		{
			getProgress: async () => buildProgress({ currentPage: 14 }),
			updateQuranProgress: async (currentPage: number) => {
				quranUpdates.push(currentPage);
			},
		},
		async () => {
			const handled = await handleReminderButtonInteraction(
				buildInteraction({
					customId: buildNextQuranPageActionCustomId('2026-04-15', 13),
					onDeferUpdate: () => {
						deferred = true;
					},
					onDelete: () => {
						deleted = true;
					},
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
	assert.equal(deferred, true);
	assert.equal(deleted, true);
	assert.deepEqual(updatePayloads, []);
	assert.deepEqual(sentPayloads, []);
	assert.match(followUpPayloads[0]?.content, /Current page is \*\*14\*\*/);
});

test('stale previous quran page buttons do not move progress backward', { concurrency: false }, async () => {
	const quranUpdates: number[] = [];
	const updatePayloads: any[] = [];
	const followUpPayloads: any[] = [];
	const sentPayloads: any[] = [];
	let deferred = false;
	let deleted = false;

	await withProgressRepositoryMocks(
		{
			getProgress: async () => buildProgress({ currentPage: 14 }),
			updateQuranProgress: async (currentPage: number) => {
				quranUpdates.push(currentPage);
			},
		},
		async () => {
			const handled = await handleReminderButtonInteraction(
				buildInteraction({
					customId: buildPreviousQuranPageActionCustomId('2026-04-15', 13),
					onDeferUpdate: () => {
						deferred = true;
					},
					onDelete: () => {
						deleted = true;
					},
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
	assert.equal(deferred, true);
	assert.equal(deleted, true);
	assert.deepEqual(updatePayloads, []);
	assert.deepEqual(sentPayloads, []);
	assert.match(followUpPayloads[0]?.content, /Current page is \*\*14\*\*/);
});

test('next quran page button wraps the prompt to page one after page 604', { concurrency: false }, async () => {
	const quranUpdates: number[] = [];
	const sentPayloads: any[] = [];
	let deleted = false;

	await withProgressRepositoryMocks(
		{
			getProgress: async () => buildProgress({ currentPage: 604 }),
			updateQuranProgress: async (currentPage: number) => {
				quranUpdates.push(currentPage);
			},
		},
		async () => {
			const handled = await handleReminderButtonInteraction(
				buildInteraction({
					customId: buildNextQuranPageActionCustomId('2026-04-15', 604),
					onDelete: () => {
						deleted = true;
					},
					onSend: (payload) => {
						sentPayloads.push(payload);
					},
				}) as any
			);

			assert.equal(handled, true);
		}
	);

	assert.deepEqual(quranUpdates, [1]);
	assert.equal(deleted, true);
	assertCurrentPagePrompt(sentPayloads[0], '2026-04-15', 1);
});

test('previous quran page button wraps the prompt to page 604 before page one', { concurrency: false }, async () => {
	const quranUpdates: number[] = [];
	const sentPayloads: any[] = [];
	let deleted = false;

	await withProgressRepositoryMocks(
		{
			getProgress: async () => buildProgress({ currentPage: 1 }),
			updateQuranProgress: async (currentPage: number) => {
				quranUpdates.push(currentPage);
			},
		},
		async () => {
			const handled = await handleReminderButtonInteraction(
				buildInteraction({
					customId: buildPreviousQuranPageActionCustomId('2026-04-15', 1),
					onDelete: () => {
						deleted = true;
					},
					onSend: (payload) => {
						sentPayloads.push(payload);
					},
				}) as any
			);

			assert.equal(handled, true);
		}
	);

	assert.deepEqual(quranUpdates, [604]);
	assert.equal(deleted, true);
	assertCurrentPagePrompt(sentPayloads[0], '2026-04-15', 604);
});

async function withAttendanceRepositoryMocks(
	overrides: Partial<
		Pick<typeof attendanceRepository, 'getAttendance' | 'getAttendanceBySessionId' | 'upsertAttendance' | 'markAttendanceAnnounced'> &
			Pick<typeof attendanceAnnouncementMessageRepository, 'getMessageBySessionId' | 'upsertMessage'>
	>,
	callback: () => Promise<void>
): Promise<void> {
	const originalGetAttendance = attendanceRepository.getAttendance;
	const originalGetAttendanceBySessionId = attendanceRepository.getAttendanceBySessionId;
	const originalUpsertAttendance = attendanceRepository.upsertAttendance;
	const originalMarkAttendanceAnnounced = attendanceRepository.markAttendanceAnnounced;
	const originalGetMessageBySessionId = attendanceAnnouncementMessageRepository.getMessageBySessionId;
	const originalUpsertMessage = attendanceAnnouncementMessageRepository.upsertMessage;

	if (overrides.getAttendance) {
		attendanceRepository.getAttendance = overrides.getAttendance;
	}

	if (overrides.getAttendanceBySessionId) {
		attendanceRepository.getAttendanceBySessionId = overrides.getAttendanceBySessionId;
	}

	if (overrides.upsertAttendance) {
		attendanceRepository.upsertAttendance = overrides.upsertAttendance;
	}

	if (overrides.markAttendanceAnnounced) {
		attendanceRepository.markAttendanceAnnounced = overrides.markAttendanceAnnounced;
	}

	if (overrides.getMessageBySessionId) {
		attendanceAnnouncementMessageRepository.getMessageBySessionId = overrides.getMessageBySessionId;
	}

	if (overrides.upsertMessage) {
		attendanceAnnouncementMessageRepository.upsertMessage = overrides.upsertMessage;
	}

	try {
		await callback();
	} finally {
		attendanceRepository.getAttendance = originalGetAttendance;
		attendanceRepository.getAttendanceBySessionId = originalGetAttendanceBySessionId;
		attendanceRepository.upsertAttendance = originalUpsertAttendance;
		attendanceRepository.markAttendanceAnnounced = originalMarkAttendanceAnnounced;
		attendanceAnnouncementMessageRepository.getMessageBySessionId = originalGetMessageBySessionId;
		attendanceAnnouncementMessageRepository.upsertMessage = originalUpsertMessage;
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
		...progress,
	};
}

function assertCurrentPageButtons(row: any, sessionId: string, page: number): void {
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

function assertCurrentPagePrompt(payload: any, sessionId: string, page: number): void {
	assert.equal('content' in payload, false);
	assert.equal(payload.flags, undefined);
	const embed = payload.embeds?.[0].toJSON() as any;
	assert.equal(embed.title, `Page ${page}`);
	assert.equal(embed.url, buildQuranPageReadUrl(page));
	assert.equal(embed.image.url, buildQuranPageImageUrl(page));
	assert.equal('footer' in embed, false);
	const row = payload.components?.[0].toJSON() as any;
	assertCurrentPageButtons(row, sessionId, page);
}

function buildInteraction(options: {
	customId: string;
	client?: any;
	sentMessageId?: string;
	userId?: string;
	username?: string;
	onDeferUpdate?: () => void;
	onDelete?: () => void;
	onEdit?: (payload: any) => void;
	onFetch?: (messageId: string) => Promise<any> | any;
	onFollowUp?: (payload: any) => void;
	onSend?: (payload: any) => void;
	onUpdate?: (payload: any) => void;
}): Record<string, unknown> {
	return {
		customId: options.customId,
		user: {
			id: options.userId ?? 'user-1',
			username: options.username ?? 'User One',
		},
		guildId: 'guild-1',
		channelId: 'channel-1',
		client: options.client,
		message: {
			channel: {
				id: 'channel-1',
				isSendable: () => true,
				messages: {
					fetch: async (messageId: string) => {
						if (options.onFetch) {
							return options.onFetch(messageId);
						}

						return {
							edit: async (payload: any) => {
								options.onEdit?.(payload);
							},
						};
					},
				},
				send: async (payload: any) => {
					options.onSend?.(payload);
					return { id: options.sentMessageId ?? 'sent-message-1' };
				},
			},
			delete: async () => {
				options.onDelete?.();
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
