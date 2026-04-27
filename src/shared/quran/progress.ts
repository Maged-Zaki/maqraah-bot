export const TOTAL_QURAN_PAGES = 604;

export function calculateProgressPercentage(currentPage: number): number {
	const normalizedCurrentPage = normalizePage(currentPage);
	return ((normalizedCurrentPage - 1) / TOTAL_QURAN_PAGES) * 100;
}

export function calculatePagesRemaining(currentPage: number): number {
	return Math.max(TOTAL_QURAN_PAGES - normalizePage(currentPage) + 1, 0);
}

function normalizePage(currentPage: number): number {
	if (!Number.isInteger(currentPage)) {
		return 1;
	}

	return Math.min(Math.max(currentPage, 1), TOTAL_QURAN_PAGES);
}
