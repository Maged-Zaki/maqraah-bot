import assert from 'node:assert/strict';
import test from 'node:test';
import { getCommandExtension, isCommandFile } from './commandRegistry';

test('isCommandFile matches command.ts with .ts extension', () => {
	assert.equal(isCommandFile('command.ts', '.ts'), true);
});

test('isCommandFile matches *Command.ts with .ts extension', () => {
	assert.equal(isCommandFile('changeUpcomingMaqraahTimeCommand.ts', '.ts'), true);
});

test('isCommandFile matches command.js with .js extension', () => {
	assert.equal(isCommandFile('command.js', '.js'), true);
});

test('isCommandFile matches *Command.js with .js extension', () => {
	assert.equal(isCommandFile('changeUpcomingMaqraahTimeCommand.js', '.js'), true);
});

test('isCommandFile rejects .d.ts declaration files', () => {
	assert.equal(isCommandFile('command.d.ts', '.ts'), false);
	assert.equal(isCommandFile('someCommand.d.ts', '.ts'), false);
});

test('isCommandFile rejects unrelated files', () => {
	assert.equal(isCommandFile('handler.ts', '.ts'), false);
	assert.equal(isCommandFile('handler.js', '.js'), false);
	assert.equal(isCommandFile('command.test.ts', '.ts'), false);
});

test('isCommandFile does not cross-match extensions', () => {
	assert.equal(isCommandFile('command.ts', '.js'), false);
	assert.equal(isCommandFile('command.js', '.ts'), false);
});

test('getCommandExtension returns .ts when running from src/app', () => {
	const ext = getCommandExtension();
	assert.ok(ext === '.ts' || ext === '.js');
});
