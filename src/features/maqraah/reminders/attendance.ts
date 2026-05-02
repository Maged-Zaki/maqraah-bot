import { attendanceRepository } from '../../../storage/sqlite';
import { logger } from '../../../observability/logging/logger';

export const attendanceStatuses = {
	LATE: 'late',
	CANNOT_MAKE_IT: 'cannot_make_it',
} as const;

export type AttendanceStatus = (typeof attendanceStatuses)[keyof typeof attendanceStatuses];

export interface AttendanceAnnouncementChannel {
	send(options: { content: string }): Promise<unknown>;
}

export interface AttendanceAnnouncement {
	userId: string;
	status: AttendanceStatus;
}

export function isAttendanceStatus(status: string): status is AttendanceStatus {
	return Object.values(attendanceStatuses).includes(status as AttendanceStatus);
}

export function buildAttendanceStatusLine(userId: string, status: AttendanceStatus): string {
	switch (status) {
		case attendanceStatuses.LATE:
			return `<@${userId}> هيتأخر شوية عن المقراة.`;
		case attendanceStatuses.CANNOT_MAKE_IT:
			return `<@${userId}> مش هيقدر يحضر المقراة النهارده.`;
	}
}

export function buildAttendanceAnnouncementMessage(attendanceAnnouncements: AttendanceAnnouncement[]): string | null {
	if (attendanceAnnouncements.length === 0) {
		return null;
	}

	const lines = attendanceAnnouncements.map((attendance) => `> ${buildAttendanceStatusLine(attendance.userId, attendance.status)}`);
	return ['**تحديثات الحضور**', ...lines].join('\n');
}

export async function announceAttendanceStatus(
	channel: AttendanceAnnouncementChannel,
	sessionId: string,
	userId: string,
	status: AttendanceStatus
): Promise<void> {
	const message = buildAttendanceAnnouncementMessage([{ userId, status }]);
	if (!message) {
		return;
	}

	await channel.send({ content: message });
	await attendanceRepository.markAttendanceAnnounced(sessionId, userId);
}

export async function announcePendingAttendance(channel: AttendanceAnnouncementChannel, sessionId: string): Promise<void> {
	const attendanceRows = await attendanceRepository.getAttendanceBySessionId(sessionId);
	const attendanceAnnouncements: AttendanceAnnouncement[] = [];

	for (const attendance of attendanceRows) {
		if (attendance.announcedAt || !isAttendanceStatus(attendance.status)) {
			continue;
		}

		attendanceAnnouncements.push({ userId: attendance.userId, status: attendance.status });
	}

	const message = buildAttendanceAnnouncementMessage(attendanceAnnouncements);
	if (!message) {
		return;
	}

	try {
		await channel.send({ content: message });

		for (const attendance of attendanceAnnouncements) {
			await attendanceRepository.markAttendanceAnnounced(sessionId, attendance.userId);
		}
	} catch (error) {
		logger.error('Failed to announce preregistered attendance', error as Error, undefined, {
			operationType: 'attendance_announcement',
			operationStatus: 'failure',
			additionalData: {
				sessionId,
				attendanceCount: attendanceAnnouncements.length,
			},
		});
	}
}
