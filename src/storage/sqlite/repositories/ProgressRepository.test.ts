import assert from 'node:assert/strict';
import test from 'node:test';
import sqlite3 from 'sqlite3';
import { ProgressRepository } from './ProgressRepository';

test('quran progress updates record page history for forward progress', async () => {
	const { db, repository } = await createRepository();

	try {
		const result = await repository.updateQuranProgress(22, '2026-04-21T10:00:00.000Z');
		const progress = await repository.getProgress();
		const history = await repository.getRecentQuranProgressHistory();

		assert.equal(result.completedKhatmah, false);
		assert.equal(result.historyRecorded, true);
		assert.equal(progress.lastPage, 22);
		assert.equal(progress.khatmahCycleCount, 0);
		assert.deepEqual(history.map((entry) => entry.pagesAdvanced), [22]);
	} finally {
		await close(db);
	}
});

test('quran progress updates increment khatmah cycles when a wrapped completion is recorded', async () => {
	const { db, repository } = await createRepository({ lastPage: 600, khatmahCycleCount: 0 });

	try {
		const result = await repository.updateQuranProgress(2, '2026-04-21T10:00:00.000Z');
		const progress = await repository.getProgress();
		const history = await repository.getRecentQuranProgressHistory();

		assert.equal(result.wrapped, true);
		assert.equal(result.completedKhatmah, true);
		assert.equal(result.pagesAdvanced, 6);
		assert.equal(progress.lastPage, 2);
		assert.equal(progress.khatmahCycleCount, 1);
		assert.equal(history[0]?.pagesAdvanced, 6);
		assert.equal(history[0]?.khatmahCycleCount, 1);
	} finally {
		await close(db);
	}
});

test('backward page corrections outside the wrap window do not affect cycle count or ETA history', async () => {
	const { db, repository } = await createRepository({ lastPage: 300, khatmahCycleCount: 2 });

	try {
		const result = await repository.updateQuranProgress(250, '2026-04-21T10:00:00.000Z');
		const progress = await repository.getProgress();
		const history = await repository.getRecentQuranProgressHistory();

		assert.equal(result.completedKhatmah, false);
		assert.equal(result.correctedBackward, true);
		assert.equal(result.historyRecorded, false);
		assert.equal(progress.lastPage, 250);
		assert.equal(progress.khatmahCycleCount, 2);
		assert.equal(history.length, 0);
	} finally {
		await close(db);
	}
});

test('recent Quran progress history returns only the latest five entries', async () => {
	const { db, repository } = await createRepository();

	try {
		for (let i = 1; i <= 6; i++) {
			await insertHistory(db, {
				lastPage: i * 10,
				khatmahCycleCount: 0,
				pagesAdvanced: i,
				recordedAt: `2026-04-0${i}T10:00:00.000Z`,
			});
		}

		const history = await repository.getRecentQuranProgressHistory();

		assert.deepEqual(
			history.map((entry) => entry.pagesAdvanced),
			[2, 3, 4, 5, 6]
		);
	} finally {
		await close(db);
	}
});

async function createRepository(
	initialProgress: Partial<{
		lastPage: number;
		lastHadith: number;
		khatmahCycleCount: number;
	}> = {}
): Promise<{ db: sqlite3.Database; repository: ProgressRepository }> {
	const db = new sqlite3.Database(':memory:');
	await run(
		db,
		`
			CREATE TABLE progress (
				id INTEGER PRIMARY KEY DEFAULT 1,
				lastPage INTEGER DEFAULT 0,
				lastHadith INTEGER DEFAULT 0,
				khatmahCycleCount INTEGER DEFAULT 0
			)
		`
	);
	await run(
		db,
		`
			CREATE TABLE quran_progress_history (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				lastPage INTEGER NOT NULL,
				khatmahCycleCount INTEGER NOT NULL DEFAULT 0,
				pagesAdvanced INTEGER NOT NULL,
				recordedAt TEXT NOT NULL
			)
		`
	);
	await run(db, 'INSERT INTO progress (id, lastPage, lastHadith, khatmahCycleCount) VALUES (1, ?, ?, ?)', [
		initialProgress.lastPage ?? 0,
		initialProgress.lastHadith ?? 0,
		initialProgress.khatmahCycleCount ?? 0,
	]);

	return { db, repository: new ProgressRepository(db) };
}

function insertHistory(
	db: sqlite3.Database,
	entry: {
		lastPage: number;
		khatmahCycleCount: number;
		pagesAdvanced: number;
		recordedAt: string;
	}
): Promise<void> {
	return run(
		db,
		`
			INSERT INTO quran_progress_history (lastPage, khatmahCycleCount, pagesAdvanced, recordedAt)
			VALUES (?, ?, ?, ?)
		`,
		[entry.lastPage, entry.khatmahCycleCount, entry.pagesAdvanced, entry.recordedAt]
	);
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
