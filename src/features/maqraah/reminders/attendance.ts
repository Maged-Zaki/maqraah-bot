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

export function isAttendanceStatus(status: string): status is AttendanceStatus {
	return Object.values(attendanceStatuses).includes(status as AttendanceStatus);
}

export function buildAttendanceStatusMessage(userId: string, status: AttendanceStatus): string {
	switch (status) {
		case attendanceStatuses.LATE:
			return `<@${userId}> هيتأخر شوية عن المقراة.`;
		case attendanceStatuses.CANNOT_MAKE_IT:
			return `<@${userId}> مش هيقدر يحضر المقراة النهارده.`;
	}
}

export async function announceAttendanceStatus(
	channel: AttendanceAnnouncementChannel,
	sessionId: string,
	userId: string,
	status: AttendanceStatus
): Promise<void> {
	await channel.send({ content: buildAttendanceStatusMessage(userId, status) });
	await attendanceRepository.markAttendanceAnnounced(sessionId, userId);
}

export async function announcePendingAttendance(channel: AttendanceAnnouncementChannel, sessionId: string): Promise<void> {
	const attendanceRows = await attendanceRepository.getAttendanceBySessionId(sessionId);

	for (const attendance of attendanceRows) {
		if (attendance.announcedAt || !isAttendanceStatus(attendance.status)) {
			continue;
		}

		try {
			await announceAttendanceStatus(channel, sessionId, attendance.userId, attendance.status);
		} catch (error) {
			logger.error('Failed to announce preregistered attendance', error as Error, undefined, {
				operationType: 'attendance_announcement',
				operationStatus: 'failure',
				additionalData: {
					sessionId,
					userId: attendance.userId,
					status: attendance.status,
				},
			});
		}
	}
}
