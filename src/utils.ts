export function getNextPage(lastPage: number): number {
	return lastPage === 604 ? 1 : lastPage + 1;
}
