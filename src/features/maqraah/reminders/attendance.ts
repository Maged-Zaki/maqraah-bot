import { attendanceAnnouncementMessageRepository, attendanceRepository } from '../../../storage/sqlite';
import { logger } from '../../../observability/logging/logger';

export const attendanceStatuses = {
	LATE: 'late',
	CANNOT_MAKE_IT: 'cannot_make_it',
} as const;

export type AttendanceStatus = (typeof attendanceStatuses)[keyof typeof attendanceStatuses];

export interface AttendanceAnnouncementChannel {
	id?: string;
	send(options: { content: string }): Promise<unknown>;
	messages?: {
		fetch(messageId: string): Promise<AttendanceAnnouncementEditableMessage>;
	};
}

export interface AttendanceAnnouncementEditableMessage {
	edit(options: { content: string }): Promise<unknown>;
}

export interface AttendanceAnnouncement {
	userId: string;
	status: AttendanceStatus;
}

export type AttendanceStatusLineBuilder = (userId: string, status: AttendanceStatus) => string;

interface SyncAttendanceAnnouncementOptions {
	onlyWhenUnannounced?: boolean;
	buildStatusLine?: AttendanceStatusLineBuilder;
}

const attendanceAnnouncementSyncs = new Map<string, Promise<void>>();

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

export function buildAttendanceAnnouncementMessage(
	attendanceAnnouncements: AttendanceAnnouncement[],
	buildStatusLine: AttendanceStatusLineBuilder = buildAttendanceStatusLine
): string | null {
	if (attendanceAnnouncements.length === 0) {
		return null;
	}

	const lines = attendanceAnnouncements.map((attendance) => `> ${buildStatusLine(attendance.userId, attendance.status)}`);
	return ['**تحديثات الحضور**', ...lines].join('\n');
}

export async function syncAttendanceAnnouncementMessage(
	channel: AttendanceAnnouncementChannel,
	sessionId: string,
	options: SyncAttendanceAnnouncementOptions = {}
): Promise<void> {
	const previousSync = attendanceAnnouncementSyncs.get(sessionId) ?? Promise.resolve();
	const nextSync = previousSync.catch(() => undefined).then(() => syncAttendanceAnnouncementMessageNow(channel, sessionId, options));
	attendanceAnnouncementSyncs.set(sessionId, nextSync);

	try {
		await nextSync;
	} finally {
		if (attendanceAnnouncementSyncs.get(sessionId) === nextSync) {
			attendanceAnnouncementSyncs.delete(sessionId);
		}
	}
}

async function syncAttendanceAnnouncementMessageNow(
	channel: AttendanceAnnouncementChannel,
	sessionId: string,
	options: SyncAttendanceAnnouncementOptions
): Promise<void> {
	const attendanceRows = await attendanceRepository.getAttendanceBySessionId(sessionId);
	const attendanceAnnouncements: AttendanceAnnouncement[] = [];
	const unannouncedAttendance: AttendanceAnnouncement[] = [];

	for (const attendance of attendanceRows) {
		if (!isAttendanceStatus(attendance.status)) {
			continue;
		}

		const announcement = { userId: attendance.userId, status: attendance.status };
		attendanceAnnouncements.push(announcement);

		if (!attendance.announcedAt) {
			unannouncedAttendance.push(announcement);
		}
	}

	if (attendanceAnnouncements.length === 0 || (options.onlyWhenUnannounced && unannouncedAttendance.length === 0)) {
		return;
	}

	const message = buildAttendanceAnnouncementMessage(attendanceAnnouncements, options.buildStatusLine);
	if (!message) {
		return;
	}

	const trackedMessage = await attendanceAnnouncementMessageRepository.getMessageBySessionId(sessionId);
	const channelId = getChannelId(channel, trackedMessage?.channelId);
	let messageId = trackedMessage?.messageId ?? null;

	if (messageId) {
		const edited = await tryEditAttendanceAnnouncementMessage(channel, messageId, message);
		if (!edited) {
			messageId = null;
		}
	}

	if (!messageId) {
		const sentMessage = await channel.send({ content: message });
		messageId = getSentMessageId(sentMessage);
		if (!messageId) {
			throw new Error('Attendance announcement send did not return a message id.');
		}
	}

	await attendanceAnnouncementMessageRepository.upsertMessage(sessionId, channelId, messageId);

	for (const attendance of unannouncedAttendance) {
		await attendanceRepository.markAttendanceAnnounced(sessionId, attendance.userId);
	}
}

export async function announcePendingAttendance(
	channel: AttendanceAnnouncementChannel,
	sessionId: string,
	options: SyncAttendanceAnnouncementOptions = {}
): Promise<void> {
	try {
		await syncAttendanceAnnouncementMessage(channel, sessionId, { onlyWhenUnannounced: true, ...options });
	} catch (error) {
		logger.error('Failed to announce preregistered attendance', error as Error, undefined, {
			operationType: 'attendance_announcement',
			operationStatus: 'failure',
			additionalData: {
				sessionId,
			},
		});
	}
}

async function tryEditAttendanceAnnouncementMessage(channel: AttendanceAnnouncementChannel, messageId: string, content: string): Promise<boolean> {
	if (!channel.messages) {
		return false;
	}

	try {
		const message = await channel.messages.fetch(messageId);
		await message.edit({ content });
		return true;
	} catch (error) {
		if (isMissingDiscordMessageError(error)) {
			return false;
		}

		throw error;
	}
}

function getSentMessageId(sentMessage: unknown): string | null {
	if (typeof sentMessage !== 'object' || sentMessage === null || !('id' in sentMessage)) {
		return null;
	}

	const { id } = sentMessage as { id?: unknown };
	return typeof id === 'string' ? id : null;
}

function getChannelId(channel: AttendanceAnnouncementChannel, fallbackChannelId?: string): string {
	if (typeof channel.id === 'string' && channel.id.length > 0) {
		return channel.id;
	}

	if (fallbackChannelId) {
		return fallbackChannelId;
	}

	if (process.env.CHANNEL_ID) {
		return process.env.CHANNEL_ID;
	}

	throw new Error('Attendance announcement channel id is unavailable.');
}

function isMissingDiscordMessageError(error: unknown): boolean {
	if (typeof error !== 'object' || error === null) {
		return false;
	}

	const candidate = error as { code?: unknown; status?: unknown; message?: unknown };
	return candidate.code === 10008 || candidate.status === 404 || (typeof candidate.message === 'string' && candidate.message.includes('Unknown Message'));
}
