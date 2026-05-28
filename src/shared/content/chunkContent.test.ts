import assert from 'node:assert/strict';
import test from 'node:test';
import { chunkContent } from './chunkContent';

test('short content returns a single chunk', () => {
	assert.deepEqual(chunkContent('hello', 100), ['hello']);
});

test('content exactly at maxLength returns a single chunk', () => {
	const content = 'a'.repeat(10);
	assert.deepEqual(chunkContent(content, 10), [content]);
});

test('splits on separator when content exceeds maxLength', () => {
	const result = chunkContent('line1\nline2\nline3', 12);
	assert.deepEqual(result, ['line1\nline2', 'line3']);
});

test('splits each long line that exceeds maxLength on its own', () => {
	const longLine = 'a'.repeat(20);
	const result = chunkContent(longLine, 10);
	assert.equal(result.length, 2);
	assert.equal(result[0], 'a'.repeat(10));
	assert.equal(result[1], 'a'.repeat(10));
});

test('empty string returns single empty chunk', () => {
	assert.deepEqual(chunkContent('', 100), ['']);
});

test('uses default maxLength of 1900 and separator of newline', () => {
	const content = 'a\nb';
	assert.deepEqual(chunkContent(content), ['a\nb']);
});

test('custom separator splits on the given separator', () => {
	const result = chunkContent('aaa|bbb|ccc', 7, '|');
	assert.deepEqual(result, ['aaa|bbb', 'ccc']);
});

test('multiple separator splits produce multiple chunks', () => {
	const lines = [];
	for (let i = 0; i < 100; i++) {
		lines.push(`line ${i}`);
	}
	const content = lines.join('\n');
	const result = chunkContent(content, 50);
	for (const chunk of result) {
		assert.ok(chunk.length <= 50, `chunk length ${chunk.length} exceeds max 50`);
	}
	assert.ok(result.length > 1);
});

test('preserves original content when reassembled', () => {
	const lines = [];
	for (let i = 0; i < 20; i++) {
		lines.push(`line number ${i} with some content`);
	}
	const content = lines.join('\n');
	const result = chunkContent(content, 50);
	assert.equal(result.join('\n'), content);
});

test('handles single separator character', () => {
	assert.deepEqual(chunkContent('\n', 100), ['\n']);
});
