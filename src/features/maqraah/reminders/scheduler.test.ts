import assert from 'node:assert/strict';
import test from 'node:test';
import { Configuration } from '../../../storage/sqlite/repositories/ConfigurationRepository';
import { Attendance } from '../../../storage/sqlite/repositories/AttendanceRepository';

process.env.DATABASE_PATH ??= ':memory:';

const { attendanceRepository } = require('../../../storage/sqlite') as typeof import('../../../storage/sqlite');
const { sendPreReminderStage } = require('./scheduler') as typeof import('./scheduler');

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
