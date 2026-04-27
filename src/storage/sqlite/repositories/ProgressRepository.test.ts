import assert from 'node:assert/strict';
import test from 'node:test';
import sqlite3 from 'sqlite3';
import { ProgressRepository } from './ProgressRepository';

test('quran progress updates only the current page', async () => {
	const { db, repository } = await createRepository({ currentPage: 12, currentHadith: 7 });

	try {
		await repository.updateQuranProgress(22);
		const progress = await repository.getProgress();

		assert.deepEqual(progress, {
			currentPage: 22,
			currentHadith: 7,
		});
	} finally {
		await close(db);
	}
});

test('quran progress updates allow wrapped page values without cycle metadata', async () => {
	const { db, repository } = await createRepository({ currentPage: 1, currentHadith: 3 });

	try {
		await repository.updateQuranProgress(604);
		const progress = await repository.getProgress();

		assert.deepEqual(progress, {
			currentPage: 604,
			currentHadith: 3,
		});
	} finally {
		await close(db);
	}
});

async function createRepository(
	initialProgress: Partial<{
		currentPage: number;
		currentHadith: number;
	}> = {}
): Promise<{ db: sqlite3.Database; repository: ProgressRepository }> {
	const db = new sqlite3.Database(':memory:');
	await run(
		db,
		`
			CREATE TABLE progress (
				id INTEGER PRIMARY KEY DEFAULT 1,
				currentPage INTEGER DEFAULT 1,
				currentHadith INTEGER DEFAULT 1
			)
		`
	);
	await run(db, 'INSERT INTO progress (id, currentPage, currentHadith) VALUES (1, ?, ?)', [
		initialProgress.currentPage ?? 1,
		initialProgress.currentHadith ?? 1,
	]);

	return { db, repository: new ProgressRepository(db) };
}

function run(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<void> {
	return new Promise((resolve, reject) => {
		db.run(sql, params, (err) => {
			if (err) {
				reject(err);
			} else {
				resolve();
			}
		});
	});
}

function close(db: sqlite3.Database): Promise<void> {
	return new Promise((resolve, reject) => {
		db.close((err) => {
			if (err) {
				reject(err);
			} else {
				resolve();
			}
		});
	});
}
