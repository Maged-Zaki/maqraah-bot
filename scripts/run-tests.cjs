#!/usr/bin/env node
'use strict';

const { readdirSync } = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const distDir = path.join(process.cwd(), 'dist');
const testFiles = findTestFiles(distDir).sort();

if (testFiles.length === 0) {
	console.error('No compiled test files found in dist. Run npm run build before running tests.');
	process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...testFiles], {
	stdio: 'inherit',
});

if (result.signal) {
	console.error(`Test runner exited after receiving signal ${result.signal}.`);
	process.exit(1);
}

process.exit(result.status ?? 1);

function findTestFiles(directory) {
	let entries;

	try {
		entries = readdirSync(directory, { withFileTypes: true });
	} catch (error) {
		if (error && error.code === 'ENOENT') {
			return [];
		}

		throw error;
	}

	return entries.flatMap((entry) => {
		const fullPath = path.join(directory, entry.name);

		if (entry.isDirectory()) {
			return findTestFiles(fullPath);
		}

		if (entry.isFile() && entry.name.endsWith('.test.js')) {
			return [fullPath];
		}

		return [];
	});
}
