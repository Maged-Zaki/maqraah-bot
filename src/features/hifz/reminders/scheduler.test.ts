import assert from 'node:assert/strict';
import test from 'node:test';
import type { Configuration } from '../../../storage/sqlite/repositories/ConfigurationRepository';
import type { Attendance } from '../../../storage/sqlite/repositories/AttendanceRepository';
import type { Note } from '../../../storage/sqlite/repositories/NotesRepository';
import type { HifzProgress } from '../../../storage/sqlite/repositories/HifzProgressRepository';

process.env.DATABASE_PATH ??= ':memory:';

const {
	attendanceAnnouncementMessageRepository,
	attendanceRepository,
	notesRepository,
	hifzProgressRepository,
} = require('../../../storage/sqlite') as typeof import('../../../storage/sqlite');
const { sendMainHifzReminder, sendPreHifzReminderStage } = require('./scheduler') as typeof import('./scheduler');

test('hifz pre reminder sends reminder first and then one framed attendance message', { concurrency: false }, async () => {
	const sentPayloads: Array<{ content: string; components?: unknown[] }> = [];
	const storedMessages: Array<{ sessionId: string; channelId: string; messageId: string }> = [];

	await withAttendanceMocks(
		{
			getAttendanceBySessionId: async () => [
				buildAttendance({ userId: 'user-1', status: 'late' }),
				buildAttendance({ userId: 'user-2', status: 'cannot_make_it' }),
			],
			markAttendanceAnnounced: async () => {},
			getMessageBySessionId: async () => null,
			upsertMessage: async (sessionId: string, channelId: string, messageId: string) => {
				storedMessages.push({ sessionId, channelId, messageId });
			},
		},
		async () => {
			await sendPreHifzReminderStage(
				{
					id: 'channel-1',
					send: async (payload: any) => {
						sentPayloads.push(payload);
						return { id: `message-${sentPayloads.length}` };
					},
				},
				buildConfiguration({ roleId: 'hifz-role' }),
				'hifz-2026-04-15'
			);
		}
	);

	assert.equal(
		sentPayloads[0]?.content,
		'<@&hifz-role> السلام عليكم ورحمة الله وبركاته\nحلقة الحفظ بعد 5 دقائق إن شاء الله.'
	);
	assert.equal(Array.isArray(sentPayloads[0]?.components), true);
	assert.deepEqual(sentPayloads.slice(1).map((payload) => payload.content), [
		'**تحديثات الحضور**\n> <@user-1> هيتأخر شوية عن حلقة الحفظ.\n> <@user-2> مش هيقدر يحضر حلقة الحفظ النهارده.',
	]);
	assert.deepEqual(storedMessages, [{ sessionId: 'hifz-2026-04-15', channelId: 'channel-1', messageId: 'message-2' }]);
});

test('hifz main reminder sends the memorization page prompt and marks notes included', { concurrency: false }, async () => {
	const sentPayloads: any[] = [];
	const updatedNotes: Array<{ ids: number[]; sessionId: string }> = [];

	await withMainMocks(
		{
			getProgress: async () => ({ currentPage: 7 }),
			getNotesByStatus: async () => [buildNote({ id: 3, note: 'راجع الصفحة' })],
			updateNotesStatusWithDate: async (ids: number[], _status: string, _date: string, sessionId: string) => {
				updatedNotes.push({ ids, sessionId });
			},
		},
		async () => {
			await sendMainHifzReminder(
				{
					send: async (payload: any) => {
						sentPayloads.push(payload);
						return { id: `m-${sentPayloads.length}` };
					},
				},
				buildConfiguration({ roleId: 'hifz-role' }),
				'hifz-2026-04-15'
			);
		}
	);

	assert.equal(sentPayloads[0].content, '<@&hifz-role> بدأت حلقة الحفظ\n\nصفحة الحفظ النهارده: [7](https://quran.com/page/7)\n');
	assert.deepEqual(updatedNotes, [{ ids: [3], sessionId: 'hifz-2026-04-15' }]);
	// notes message then page prompt
	assert.ok(sentPayloads.length >= 2);
	const pagePrompt = sentPayloads[sentPayloads.length - 1];
	assert.equal(pagePrompt.embeds.length, 1);
	assert.equal(pagePrompt.components.length, 1);
});

test('hifz main reminder skips notes block when there are none', { concurrency: false }, async () => {
	const sentPayloads: any[] = [];
	let updateCalled = false;

	await withMainMocks(
		{
			getProgress: async () => ({ currentPage: 1 }),
			getNotesByStatus: async () => [],
			updateNotesStatusWithDate: async () => {
				updateCalled = true;
			},
		},
		async () => {
			await sendMainHifzReminder(
				{
					send: async (payload: any) => {
						sentPayloads.push(payload);
						return { id: `m-${sentPayloads.length}` };
					},
				},
				buildConfiguration({ roleId: 'hifz-role' }),
				'hifz-2026-04-15'
			);
		}
	);

	assert.equal(updateCalled, false);
	// only the main message + page prompt
	assert.equal(sentPayloads.length, 2);
});

async function withAttendanceMocks(
	overrides: Partial<
		Pick<typeof attendanceRepository, 'getAttendanceBySessionId' | 'markAttendanceAnnounced'> &
			Pick<typeof attendanceAnnouncementMessageRepository, 'getMessageBySessionId' | 'upsertMessage'>
	>,
	callback: () => Promise<void>
): Promise<void> {
	const originals = {
		getAttendanceBySessionId: attendanceRepository.getAttendanceBySessionId,
		markAttendanceAnnounced: attendanceRepository.markAttendanceAnnounced,
		getMessageBySessionId: attendanceAnnouncementMessageRepository.getMessageBySessionId,
		upsertMessage: attendanceAnnouncementMessageRepository.upsertMessage,
	};

	if (overrides.getAttendanceBySessionId) {
		attendanceRepository.getAttendanceBySessionId = overrides.getAttendanceBySessionId;
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
		attendanceRepository.getAttendanceBySessionId = originals.getAttendanceBySessionId;
		attendanceRepository.markAttendanceAnnounced = originals.markAttendanceAnnounced;
		attendanceAnnouncementMessageRepository.getMessageBySessionId = originals.getMessageBySessionId;
		attendanceAnnouncementMessageRepository.upsertMessage = originals.upsertMessage;
	}
}

async function withMainMocks(
	overrides: Partial<Pick<typeof hifzProgressRepository, 'getProgress'> & Pick<typeof notesRepository, 'getNotesByStatus' | 'updateNotesStatusWithDate'>>,
	callback: () => Promise<void>
): Promise<void> {
	const originals = {
		getProgress: hifzProgressRepository.getProgress,
		getNotesByStatus: notesRepository.getNotesByStatus,
		updateNotesStatusWithDate: notesRepository.updateNotesStatusWithDate,
	};

	if (overrides.getProgress) {
		hifzProgressRepository.getProgress = overrides.getProgress;
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
		hifzProgressRepository.getProgress = originals.getProgress;
		notesRepository.getNotesByStatus = originals.getNotesByStatus;
		notesRepository.updateNotesStatusWithDate = originals.updateNotesStatusWithDate;
	}
}

function buildAttendance(attendance: Partial<Attendance>): Attendance {
	return {
		id: 1,
		sessionId: 'hifz-2026-04-15',
		userId: 'user-1',
		status: 'late',
		updatedAt: '2026-04-15T10:00:00.000Z',
		announcedAt: null,
		...attendance,
	};
}

function buildProgress(progress: Partial<HifzProgress>): HifzProgress {
	return {
		currentPage: 1,
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
		hifzTime: '6:00 PM',
		hifzReminderEnabled: 1,
		hifzPreReminderEnabled: 1,
		hifzPreReminderOffsetMinutes: 5,
		...configuration,
	};
}
