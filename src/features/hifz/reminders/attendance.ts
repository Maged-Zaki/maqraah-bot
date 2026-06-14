import {
	announcePendingAttendance,
	syncAttendanceAnnouncementMessage,
	type AttendanceStatus,
	type AttendanceStatusLineBuilder,
	type AttendanceAnnouncementChannel,
} from '../../maqraah/reminders/attendance';

export type { AttendanceAnnouncementChannel };

export const hifzAttendanceStatuses = {
	LATE: 'late',
	CANNOT_MAKE_IT: 'cannot_make_it',
} as const;

export type HifzAttendanceStatus = AttendanceStatus;

export function buildHifzAttendanceStatusLine(userId: string, status: HifzAttendanceStatus): string {
	switch (status) {
		case hifzAttendanceStatuses.LATE:
			return `<@${userId}> هيتأخر شوية عن حلقة الحفظ.`;
		case hifzAttendanceStatuses.CANNOT_MAKE_IT:
			return `<@${userId}> مش هيقدر يحضر حلقة الحفظ النهارده.`;
	}
}

const hifzStatusLineBuilder: AttendanceStatusLineBuilder = buildHifzAttendanceStatusLine;

export function syncHifzAttendanceAnnouncementMessage(channel: AttendanceAnnouncementChannel, sessionId: string): Promise<void> {
	return syncAttendanceAnnouncementMessage(channel, sessionId, { buildStatusLine: hifzStatusLineBuilder });
}

export function announcePendingHifzAttendance(channel: AttendanceAnnouncementChannel, sessionId: string): Promise<void> {
	return announcePendingAttendance(channel, sessionId, { buildStatusLine: hifzStatusLineBuilder });
}

export { isAttendanceStatus as isHifzAttendanceStatus } from '../../maqraah/reminders/attendance';
