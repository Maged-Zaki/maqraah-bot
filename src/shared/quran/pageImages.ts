import { TOTAL_QURAN_PAGES } from './progress';

const quranPageReadBaseUrl = 'https://quran.com/page';
const quranPageImageBaseUrl = 'https://raw.githubusercontent.com/QuranHub/quran-pages-images/main/easyquran.com/hafs-tajweed';

export function buildQuranPageReadUrl(page: number): string {
	assertValidQuranPage(page);
	return `${quranPageReadBaseUrl}/${page}`;
}

export function buildQuranPageImageUrl(page: number): string {
	assertValidQuranPage(page);
	return `${quranPageImageBaseUrl}/${page}.jpg`;
}

export function isValidQuranPage(page: number): boolean {
	return Number.isInteger(page) && page >= 1 && page <= TOTAL_QURAN_PAGES;
}

function assertValidQuranPage(page: number): void {
	if (!isValidQuranPage(page)) {
		throw new RangeError(`Quran page must be an integer between 1 and ${TOTAL_QURAN_PAGES}.`);
	}
}
