import type { Schedule } from '../../storage/sqlite/repositories/ScheduleRepository';

export type MentionTargetType = 'user' | 'role';

export interface MentionTarget {
	type: MentionTargetType;
	id: string;
}

export interface ParsedPeopleMentions {
	valid: boolean;
	targets: MentionTarget[];
}

export function parsePeopleMentions(input: string | null | undefined, required: boolean = false): ParsedPeopleMentions {
	if (input === null || input === undefined) {
		return { valid: !required, targets: [] };
	}

	const trimmedInput = input.trim();
	if (!trimmedInput) {
		return { valid: false, targets: [] };
	}

	const mentionPattern = /<@!?(\d+)>|<@&(\d+)>/g;
	const targets: MentionTarget[] = [];
	for (const match of trimmedInput.matchAll(mentionPattern)) {
		if (match[1]) {
			targets.push({ type: 'user', id: match[1] });
		} else if (match[2]) {
			targets.push({ type: 'role', id: match[2] });
		}
	}

	const leftoverText = trimmedInput.replace(mentionPattern, '').replace(/[,\s]+/g, '');
	if (targets.length === 0 || leftoverText.length > 0) {
		return { valid: false, targets: [] };
	}

	return { valid: true, targets: dedupeMentionTargets(targets) };
}

export function serializeMentionTargets(targets: MentionTarget[]): string {
	return dedupeMentionTargets(targets)
		.map((target) => `${target.type}:${target.id}`)
		.join(',');
}

export function parseStoredMentionTargets(value: string | null | undefined): MentionTarget[] {
	if (!value) {
		return [];
	}

	const targets: MentionTarget[] = [];
	for (const part of value.split(',')) {
		const token = part.trim();
		const typedMatch = /^(user|role):(\d+)$/.exec(token);
		if (typedMatch) {
			targets.push({ type: typedMatch[1] as MentionTargetType, id: typedMatch[2] });
			continue;
		}

		if (/^\d+$/.test(token)) {
			targets.push({ type: 'user', id: token });
		}
	}

	return dedupeMentionTargets(targets);
}

export function formatMentionTargets(value: string | null | undefined): string {
	return parseStoredMentionTargets(value)
		.map((target) => (target.type === 'role' ? `<@&${target.id}>` : `<@${target.id}>`))
		.join(' ');
}

export function buildScheduleFireMessage(schedule: Schedule): string {
	const people = formatMentionTargets(schedule.mentionUserIds);
	return people ? `${people}\n${schedule.message}` : schedule.message;
}

function dedupeMentionTargets(targets: MentionTarget[]): MentionTarget[] {
	const seen = new Set<string>();
	const dedupedTargets: MentionTarget[] = [];
	for (const target of targets) {
		const key = `${target.type}:${target.id}`;
		if (!seen.has(key)) {
			seen.add(key);
			dedupedTargets.push(target);
		}
	}

	return dedupedTargets;
}
