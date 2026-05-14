export const defaultIsoDateListLimit = 30;

export interface ParsedIsoDateList {
	dates: string[];
	hasInput: boolean;
	error?: string;
}

export function parseIsoDateList(input: string | null | undefined, limit: number = defaultIsoDateListLimit): ParsedIsoDateList {
	const trimmedInput = input?.trim();
	if (!trimmedInput) {
		return { dates: [], hasInput: false };
	}

	const parts = trimmedInput.split(',').map((part) => part.trim());
	if (parts.some((part) => part.length === 0)) {
		return { dates: [], hasInput: true, error: 'Dates must be comma-separated `YYYY-MM-DD` values, such as `2026-04-20, 2026-04-22`.' };
	}

	if (parts.length > limit) {
		return { dates: [], hasInput: true, error: `You can specify up to ${limit} dates at a time.` };
	}

	for (const part of parts) {
		if (!isValidIsoDate(part)) {
			return { dates: [], hasInput: true, error: 'Invalid date. Please use `YYYY-MM-DD`, such as `2026-04-20`.' };
		}
	}

	return {
		dates: [...new Set(parts)].sort(),
		hasInput: true,
	};
}

export function isValidIsoDate(date: string | null | undefined): boolean {
	if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
		return false;
	}

	const [year, month, day] = date.split('-').map((part) => Number.parseInt(part, 10));
	const parsedDate = new Date(Date.UTC(year, month - 1, day));

	return (
		parsedDate.getUTCFullYear() === year &&
		parsedDate.getUTCMonth() === month - 1 &&
		parsedDate.getUTCDate() === day
	);
}
