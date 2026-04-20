import type { Schedule } from '../../storage/sqlite/repositories/ScheduleRepository';

export interface ParsedPeopleMentions {
	valid: boolean;
	userIds: string[];
}

export function parsePeopleMentions(input: string | null | undefined, required: boolean = false): ParsedPeopleMentions {
	if (input === null || input === undefined) {
		return { valid: !required, userIds: [] };
	}

	const trimmedInput = input.trim();
	if (!trimmedInput) {
		return { valid: false, userIds: [] };
	}

	const userMentionPattern = /<@!?(\d+)>/g;
	const userIds: string[] = [];
	for (const match of trimmedInput.matchAll(userMentionPattern)) {
		userIds.push(match[1]);
	}

	const leftoverText = trimmedInput.replace(userMentionPattern, '').replace(/[,\s]+/g, '');
	if (userIds.length === 0 || leftoverText.length > 0) {
		return { valid: false, userIds: [] };
	}

	return { valid: true, userIds: dedupeUserIds(userIds) };
}

export function serializeMentionUserIds(userIds: string[]): string {
	return dedupeUserIds(userIds).join(',');
}

export function parseMentionUserIds(value: string | null | undefined): string[] {
	if (!value) {
		return [];
	}

	return dedupeUserIds(
		value
			.split(',')
			.map((part) => part.trim())
			.filter((part) => /^\d+$/.test(part))
	);
}

export function formatUserMentions(value: string | null | undefined): string {
	return parseMentionUserIds(value)
		.map((userId) => `<@${userId}>`)
		.join(' ');
}

export function buildScheduleFireMessage(schedule: Schedule): string {
	const people = formatUserMentions(schedule.mentionUserIds);
	return people ? `${people}\n${schedule.message}` : schedule.message;
}

function dedupeUserIds(userIds: string[]): string[] {
	return [...new Set(userIds)];
}
