export function migrateLegacyLastPageToCurrentPage(lastPage: number | null | undefined): number {
	if (typeof lastPage !== 'number' || !Number.isInteger(lastPage) || lastPage <= 0) {
		return 1;
	}

	if (lastPage >= 604) {
		return 1;
	}

	return lastPage + 1;
}

export function migrateLegacyLastHadithToCurrentHadith(lastHadith: number | null | undefined): number {
	if (typeof lastHadith !== 'number' || !Number.isInteger(lastHadith) || lastHadith <= 0) {
		return 1;
	}

	return lastHadith + 1;
}
