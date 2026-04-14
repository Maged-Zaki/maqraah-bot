export function getNextPage(lastPage: number): number {
	if (lastPage >= 604) {
		return 1;
	}

	return lastPage + 1;
}
