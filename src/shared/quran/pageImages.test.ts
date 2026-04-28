import assert from 'node:assert/strict';
import test from 'node:test';
import { buildQuranPageImageUrl, buildQuranPageReadUrl, isValidQuranPage } from './pageImages';

test('quran page URL helpers build read and image URLs', () => {
	for (const page of [1, 13, 604]) {
		assert.equal(buildQuranPageReadUrl(page), `https://quran.com/page/${page}`);
		assert.equal(buildQuranPageImageUrl(page), `https://raw.githubusercontent.com/QuranHub/quran-pages-images/main/easyquran.com/hafs-tajweed/${page}.jpg`);
		assert.equal(isValidQuranPage(page), true);
	}
});

test('quran page URL helpers reject invalid pages', () => {
	for (const page of [0, 605, -1, 1.5, Number.NaN]) {
		assert.equal(isValidQuranPage(page), false);
		assert.throws(() => buildQuranPageReadUrl(page), /Quran page must be an integer between 1 and 604/);
		assert.throws(() => buildQuranPageImageUrl(page), /Quran page must be an integer between 1 and 604/);
	}
});
