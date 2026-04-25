import assert from 'node:assert/strict';
import test from 'node:test';
import {
	migrateLegacyLastHadithToCurrentHadith,
	migrateLegacyLastPageToCurrentPage,
	shouldIncrementKhatmahForLegacyLastPage,
} from './progressMigration';

test('legacy last quran page values migrate to current page values', () => {
	assert.equal(migrateLegacyLastPageToCurrentPage(0), 1);
	assert.equal(migrateLegacyLastPageToCurrentPage(10), 11);
	assert.equal(migrateLegacyLastPageToCurrentPage(604), 1);
});

test('legacy completed khatmah counts are preserved when last page was complete', () => {
	assert.equal(shouldIncrementKhatmahForLegacyLastPage(603), false);
	assert.equal(shouldIncrementKhatmahForLegacyLastPage(604), true);
});

test('legacy last hadith values migrate to current hadith values', () => {
	assert.equal(migrateLegacyLastHadithToCurrentHadith(0), 1);
	assert.equal(migrateLegacyLastHadithToCurrentHadith(40), 41);
});
