export function incrementQuranPage(currentPage: number): number {
	if (currentPage >= 604) {
		return 1;
	}

	return currentPage + 1;
}
