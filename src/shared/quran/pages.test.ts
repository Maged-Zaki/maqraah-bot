import assert from 'node:assert/strict';
import test from 'node:test';
import { decrementQuranPage, incrementQuranPage } from './pages';

test('quran page helpers wrap at the mushaf boundaries', () => {
	assert.equal(incrementQuranPage(12), 13);
	assert.equal(incrementQuranPage(604), 1);
	assert.equal(decrementQuranPage(13), 12);
	assert.equal(decrementQuranPage(1), 604);
});
