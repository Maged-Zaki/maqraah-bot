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

export function isQuranProgressWrap(previousCurrentPage: number, newCurrentPage: number): boolean {
	return (
		previousCurrentPage > newCurrentPage &&
		isWithinRange(previousCurrentPage, WRAP_START_PAGE, TOTAL_QURAN_PAGES) &&
		isWithinRange(newCurrentPage, 1, WRAP_RESET_MAX_PAGE)
	);
}

export function getQuranPageUpdateMetrics(previousCurrentPage: number, newCurrentPage: number, previousCycleCount: number): QuranPageUpdateMetrics {
	const wrapped = isQuranProgressWrap(previousCurrentPage, newCurrentPage);
	const correctedBackward = newCurrentPage < previousCurrentPage && !wrapped;
	const shouldRecordHistory = newCurrentPage !== previousCurrentPage && !correctedBackward;
	const pagesAdvanced = shouldRecordHistory ? calculatePagesAdvanced(previousCurrentPage, newCurrentPage, wrapped) : 0;

	return {
		wrapped,
		completedKhatmah: wrapped,
		pagesAdvanced,
		shouldRecordHistory,
		correctedBackward,
		nextCycleCount: previousCycleCount + (wrapped ? 1 : 0),
	};
}

export function calculatePagesAdvanced(previousCurrentPage: number, newCurrentPage: number, wrapped: boolean): number {
	if (wrapped) {
		return TOTAL_QURAN_PAGES - previousCurrentPage + newCurrentPage;
	}

	return Math.max(newCurrentPage - previousCurrentPage, 0);
}

export function calculateProgressPercentage(currentPage: number): number {
	const normalizedCurrentPage = normalizePage(currentPage);
	return ((normalizedCurrentPage - 1) / TOTAL_QURAN_PAGES) * 100;
}

export function calculatePagesRemaining(currentPage: number): number {
	return Math.max(TOTAL_QURAN_PAGES - normalizePage(currentPage) + 1, 0);
}

export function getCompletedKhatmahCount(progress: Pick<Progress, 'currentPage' | 'khatmahCycleCount'>): number {
	return progress.khatmahCycleCount;
}

export function estimateKhatmahCompletion(
	currentPage: number,
	recentHistory: Array<Pick<QuranProgressHistoryEntry, 'pagesAdvanced'>>,
	now: Date = new Date()
): KhatmahCompletionEstimate | 'completed' | null {
	if (recentHistory.length === 0) {
		return null;
	}

	const totalPagesAdvanced = recentHistory.reduce((sum, entry) => sum + Math.max(entry.pagesAdvanced, 0), 0);
	if (totalPagesAdvanced <= 0) {
		return null;
	}

	const averagePagesPerSession = totalPagesAdvanced / recentHistory.length;
	const remainingSessions = Math.ceil(calculatePagesRemaining(currentPage) / averagePagesPerSession);

	return {
		averagePagesPerSession,
		remainingSessions,
		estimatedCompletionDate: new Date(now.getTime() + remainingSessions * 24 * 60 * 60 * 1000),
	};
}

function isWithinRange(value: number, min: number, max: number): boolean {
	return Number.isInteger(value) && value >= min && value <= max;
}

function normalizePage(currentPage: number): number {
	if (!Number.isInteger(currentPage)) {
		return 1;
	}

	return Math.min(Math.max(currentPage, 1), TOTAL_QURAN_PAGES);
}
