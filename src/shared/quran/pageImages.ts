import { TOTAL_QURAN_PAGES } from './progress';

const quranPageReadBaseUrl = 'https://quran.com/page';
const quranPageImageBaseUrl = 'https://raw.githubusercontent.com/jahedev/tajweed-quran-pages/master/hafs';

export function buildQuranPageReadUrl(page: number): string {
	assertValidQuranPage(page);
	return `${quranPageReadBaseUrl}/${page}`;
}

export function buildQuranPageImageUrl(page: number): string {
	assertValidQuranPage(page);
	return `${quranPageImageBaseUrl}/tajweed-${String(page).padStart(3, '0')}.jpg`;
}

export function isValidQuranPage(page: number): boolean {
	return Number.isInteger(page) && page >= 1 && page <= TOTAL_QURAN_PAGES;
}

function assertValidQuranPage(page: number): void {
	if (!isValidQuranPage(page)) {
		throw new RangeError(`Quran page must be an integer between 1 and ${TOTAL_QURAN_PAGES}.`);
	}
}
