export function incrementQuranPage(currentPage: number): number {
	if (currentPage >= 604) {
		return 1;
	}

	return currentPage + 1;
}

export function decrementQuranPage(currentPage: number): number {
	if (currentPage <= 1) {
		return 604;
	}

	return currentPage - 1;
}
