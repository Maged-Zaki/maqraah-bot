import type { Progress, QuranProgressHistoryEntry } from '../../storage/sqlite/repositories/ProgressRepository';

export const TOTAL_QURAN_PAGES = 604;
const WRAP_START_PAGE = 500;
const WRAP_RESET_MAX_PAGE = 100;

export interface QuranPageUpdateMetrics {
	wrapped: boolean;
	completedKhatmah: boolean;
	pagesAdvanced: number;
	shouldRecordHistory: boolean;
	correctedBackward: boolean;
	nextCycleCount: number;
}

export interface KhatmahCompletionEstimate {
	averagePagesPerSession: number;
	remainingSessions: number;
	estimatedCompletionDate: Date;
}

export function isQuranProgressWrap(previousLastPage: number, newLastPage: number): boolean {
	return (
		previousLastPage > newLastPage &&
		isWithinRange(previousLastPage, WRAP_START_PAGE, TOTAL_QURAN_PAGES) &&
		isWithinRange(newLastPage, 1, WRAP_RESET_MAX_PAGE)
	);
}

export function getQuranPageUpdateMetrics(previousLastPage: number, newLastPage: number, previousCycleCount: number): QuranPageUpdateMetrics {
	const wrapped = isQuranProgressWrap(previousLastPage, newLastPage);
	const correctedBackward = newLastPage < previousLastPage && !wrapped;
	const shouldRecordHistory = newLastPage !== previousLastPage && !correctedBackward;
	const pagesAdvanced = shouldRecordHistory ? calculatePagesAdvanced(previousLastPage, newLastPage, wrapped) : 0;

	return {
		wrapped,
		completedKhatmah: previousLastPage < TOTAL_QURAN_PAGES && (newLastPage === TOTAL_QURAN_PAGES || wrapped),
		pagesAdvanced,
		shouldRecordHistory,
		correctedBackward,
		nextCycleCount: previousCycleCount + (wrapped ? 1 : 0),
	};
}

export function calculatePagesAdvanced(previousLastPage: number, newLastPage: number, wrapped: boolean): number {
	if (previousLastPage === 0) {
		return newLastPage;
	}

	if (wrapped) {
		return TOTAL_QURAN_PAGES - previousLastPage + newLastPage;
	}

	return Math.max(newLastPage - previousLastPage, 0);
}

export function calculateProgressPercentage(lastPage: number): number {
	const normalizedLastPage = normalizePage(lastPage);
	return (normalizedLastPage / TOTAL_QURAN_PAGES) * 100;
}

export function calculatePagesRemaining(lastPage: number): number {
	return Math.max(TOTAL_QURAN_PAGES - normalizePage(lastPage), 0);
}

export function getCompletedKhatmahCount(progress: Pick<Progress, 'lastPage' | 'khatmahCycleCount'>): number {
	return progress.lastPage === TOTAL_QURAN_PAGES ? progress.khatmahCycleCount + 1 : progress.khatmahCycleCount;
}

export function estimateKhatmahCompletion(
	lastPage: number,
	recentHistory: Array<Pick<QuranProgressHistoryEntry, 'pagesAdvanced'>>,
	now: Date = new Date()
): KhatmahCompletionEstimate | 'completed' | null {
	if (normalizePage(lastPage) === TOTAL_QURAN_PAGES) {
		return 'completed';
	}

	if (recentHistory.length === 0) {
		return null;
	}

	const totalPagesAdvanced = recentHistory.reduce((sum, entry) => sum + Math.max(entry.pagesAdvanced, 0), 0);
	if (totalPagesAdvanced <= 0) {
		return null;
	}

	const averagePagesPerSession = totalPagesAdvanced / recentHistory.length;
	const remainingSessions = Math.ceil(calculatePagesRemaining(lastPage) / averagePagesPerSession);

	return {
		averagePagesPerSession,
		remainingSessions,
		estimatedCompletionDate: new Date(now.getTime() + remainingSessions * 24 * 60 * 60 * 1000),
	};
}

function isWithinRange(value: number, min: number, max: number): boolean {
	return Number.isInteger(value) && value >= min && value <= max;
}

function normalizePage(lastPage: number): number {
	if (!Number.isInteger(lastPage)) {
		return 0;
	}

	return Math.min(Math.max(lastPage, 0), TOTAL_QURAN_PAGES);
}
