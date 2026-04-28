import assert from 'node:assert/strict';
import test from 'node:test';
import { Configuration } from '../../../storage/sqlite/repositories/ConfigurationRepository';
import { Attendance } from '../../../storage/sqlite/repositories/AttendanceRepository';
import type { Note } from '../../../storage/sqlite/repositories/NotesRepository';
import type { Progress } from '../../../storage/sqlite/repositories/ProgressRepository';

process.env.DATABASE_PATH ??= ':memory:';

const { attendanceRepository, notesRepository, progressRepository } = require('../../../storage/sqlite') as typeof import('../../../storage/sqlite');
const { parseReminderActionCustomId, reminderActions } = require('./components') as typeof import('./components');
const { sendMainReminder, sendPreReminderStage } = require('./scheduler') as typeof import('./scheduler');

test('pre reminder sends the reminder first and then preregistered attendance messages', { concurrency: false }, async () => {
	const sentPayloads: Array<{ content: string; components?: unknown[] }> = [];
	const markedAttendance: string[] = [];

	await withAttendanceRepositoryMocks(
		{
			getAttendanceBySessionId: async () => [
				buildAttendance({ userId: 'user-1', status: 'late', updatedAt: '2026-04-15T10:00:00.000Z' }),
				buildAttendance({ userId: 'user-2', status: 'cannot_make_it', updatedAt: '2026-04-15T10:01:00.000Z' }),
			],
			markAttendanceAnnounced: async (_sessionId: string, userId: string) => {
				markedAttendance.push(userId);
			},
		},
		async () => {
			await sendPreReminderStage(
				{
					send: async (payload) => {
						sentPayloads.push(payload);
					},
				},
				buildConfiguration({ roleId: 'daily-role' }),
				'2026-04-15'
			);
		}
	);

	assert.equal(sentPayloads[0]?.content, '<@&daily-role> السلام عليكم ورحمة الله وبركاته\nالمقراة اليومية بعد 5 دقائق إن شاء الله.');
	assert.equal(Array.isArray(sentPayloads[0]?.components), true);
	assert.deepEqual(
		sentPayloads.slice(1).map((payload) => payload.content),
		['<@user-1> هيتأخر شوية عن المقراة.', '<@user-2> مش هيقدر يحضر المقراة النهارده.']
	);
	assert.deepEqual(markedAttendance, ['user-1', 'user-2']);
});

test('pre reminder keeps announcing later rows when one preregistered send fails', { concurrency: false }, async () => {
	const sentPayloads: string[] = [];
	const markedAttendance: string[] = [];
	let sendCount = 0;

	await withAttendanceRepositoryMocks(
		{
			getAttendanceBySessionId: async () => [
				buildAttendance({ userId: 'user-1', status: 'late', updatedAt: '2026-04-15T10:00:00.000Z' }),
				buildAttendance({ userId: 'user-2', status: 'cannot_make_it', updatedAt: '2026-04-15T10:01:00.000Z' }),
			],
			markAttendanceAnnounced: async (_sessionId: string, userId: string) => {
				markedAttendance.push(userId);
			},
		},
		async () => {
			await sendPreReminderStage(
				{
					send: async (payload) => {
						sendCount += 1;
						if (sendCount === 2) {
							throw new Error('send failed');
						}
						sentPayloads.push(payload.content);
					},
				},
				buildConfiguration({ roleId: 'daily-role' }),
				'2026-04-15'
			);
		}
	);

	assert.deepEqual(sentPayloads, [
		'<@&daily-role> السلام عليكم ورحمة الله وبركاته\nالمقراة اليومية بعد 5 دقائق إن شاء الله.',
		'<@user-2> مش هيقدر يحضر المقراة النهارده.',
	]);
	assert.deepEqual(markedAttendance, ['user-2']);
});

test('main reminder sends the current quran page prompt after notes', { concurrency: false }, async () => {
	const sentPayloads: Array<{ content: string; components?: unknown[]; embeds?: unknown[] }> = [];
	const includedNoteIds: number[][] = [];

	await withMainReminderRepositoryMocks(
		{
			getProgress: async () => buildProgress({ currentPage: 13, currentHadith: 35 }),
			getNotesByStatus: async () => [buildNote({ id: 7, note: 'Review tajweed point' })],
			updateNotesStatusWithDate: async (noteIds: number[]) => {
				includedNoteIds.push(noteIds);
			},
		},
		async () => {
			await sendMainReminder(
				{
					send: async (payload: { content: string; components?: unknown[]; embeds?: unknown[] }) => {
						sentPayloads.push(payload);
					},
				},
				buildConfiguration({ roleId: 'daily-role' }),
				'2026-04-15'
			);
		}
	);

	assert.deepEqual(includedNoteIds, [[7]]);
	assert.match(sentPayloads[0]?.content, /الصفحة الحالية: \[13\]/);
	assert.match(sentPayloads[0]?.content, /الحديث الحالي: \*\*35\*\*/);
	assert.equal(sentPayloads[1]?.content, 'ملاحظات اليوم:\n1. Review tajweed point\n');
	assert.equal(sentPayloads[2]?.content, 'Current page: 13');
	const embed = (sentPayloads[2]?.embeds?.[0] as any).toJSON();
	assert.equal(embed.title, 'Read page 13');
	assert.equal(embed.url, 'https://quran.com/page/13');
	assert.equal(embed.image.url, 'https://raw.githubusercontent.com/QuranHub/quran-pages-images/main/easyquran.com/hafs-tajweed/13.jpg');
	assert.equal(embed.footer.text, 'Image source: QuranHub');
	const row = (sentPayloads[2]?.components?.[0] as any).toJSON();
	assert.deepEqual(parseReminderActionCustomId(row.components[0].custom_id), {
		action: reminderActions.PREVIOUS_QURAN_PAGE,
		sessionId: '2026-04-15',
		page: 13,
	});
	assert.deepEqual(parseReminderActionCustomId(row.components[1].custom_id), {
		action: reminderActions.NEXT_QURAN_PAGE,
		sessionId: '2026-04-15',
		page: 13,
	});
});

async function withAttendanceRepositoryMocks(
	overrides: Partial<Pick<typeof attendanceRepository, 'getAttendanceBySessionId' | 'markAttendanceAnnounced'>>,
	callback: () => Promise<void>
): Promise<void> {
	const originalGetAttendanceBySessionId = attendanceRepository.getAttendanceBySessionId;
	const originalMarkAttendanceAnnounced = attendanceRepository.markAttendanceAnnounced;

	if (overrides.getAttendanceBySessionId) {
		attendanceRepository.getAttendanceBySessionId = overrides.getAttendanceBySessionId;
	}

	if (overrides.markAttendanceAnnounced) {
		attendanceRepository.markAttendanceAnnounced = overrides.markAttendanceAnnounced;
	}

	try {
		await callback();
	} finally {
		attendanceRepository.getAttendanceBySessionId = originalGetAttendanceBySessionId;
		attendanceRepository.markAttendanceAnnounced = originalMarkAttendanceAnnounced;
	}
}

async function withMainReminderRepositoryMocks(
	overrides: Partial<Pick<typeof progressRepository, 'getProgress'> & Pick<typeof notesRepository, 'getNotesByStatus' | 'updateNotesStatusWithDate'>>,
	callback: () => Promise<void>
): Promise<void> {
	const originalGetProgress = progressRepository.getProgress;
	const originalGetNotesByStatus = notesRepository.getNotesByStatus;
	const originalUpdateNotesStatusWithDate = notesRepository.updateNotesStatusWithDate;

	if (overrides.getProgress) {
		progressRepository.getProgress = overrides.getProgress;
	}

	if (overrides.getNotesByStatus) {
		notesRepository.getNotesByStatus = overrides.getNotesByStatus;
	}

	if (overrides.updateNotesStatusWithDate) {
		notesRepository.updateNotesStatusWithDate = overrides.updateNotesStatusWithDate;
	}

	try {
		await callback();
	} finally {
		progressRepository.getProgress = originalGetProgress;
		notesRepository.getNotesByStatus = originalGetNotesByStatus;
		notesRepository.updateNotesStatusWithDate = originalUpdateNotesStatusWithDate;
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

function buildNote(note: Partial<Note>): Note {
	return {
		id: 1,
		userId: 'user-1',
		note: 'Note',
		dateAdded: '2026-04-15T10:00:00.000Z',
		status: 'pending',
		...note,
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
