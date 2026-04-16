import assert from 'node:assert/strict';
import test from 'node:test';
import sqlite3 from 'sqlite3';
import { NotesRepository } from './NotesRepository';

test('text search finds matching notes', async () => {
	const { db, repository } = await createRepository();

	try {
		await insertNote(db, { userId: 'user-1', note: 'Review tajweed rules', dateAdded: '2026-04-15T12:00:00.000Z', status: 'pending' });
		await insertNote(db, { userId: 'user-2', note: 'Bring tea next time', dateAdded: '2026-04-15T13:00:00.000Z', status: 'pending' });

		const notes = await repository.searchNotes({ query: 'tajweed' });

		assert.deepEqual(
			notes.map((note) => note.note),
			['Review tajweed rules']
		);
	} finally {
		await close(db);
	}
});

test('user filter limits search results', async () => {
	const { db, repository } = await createRepository();

	try {
		await insertNote(db, { userId: 'user-1', note: 'Practice Surah Al-Mulk', dateAdded: '2026-04-15T12:00:00.000Z', status: 'pending' });
		await insertNote(db, { userId: 'user-2', note: 'Practice Surah Al-Mulk', dateAdded: '2026-04-15T13:00:00.000Z', status: 'pending' });

		const notes = await repository.searchNotes({ query: 'surah', userId: 'user-1' });

		assert.deepEqual(
			notes.map((note) => note.userId),
			['user-1']
		);
	} finally {
		await close(db);
	}
});

test('status filter limits search results', async () => {
	const { db, repository } = await createRepository();

	try {
		await insertNote(db, { userId: 'user-1', note: 'Review action item', dateAdded: '2026-04-15T12:00:00.000Z', status: 'pending' });
		await insertNote(db, {
			userId: 'user-2',
			note: 'Review action item',
			dateAdded: '2026-04-14T12:00:00.000Z',
			status: 'included',
			lastIncludedDate: '2026-04-15T19:00:00.000Z',
		});

		const notes = await repository.searchNotes({ query: 'review', status: 'included' });

		assert.deepEqual(
			notes.map((note) => note.status),
			['included']
		);
	} finally {
		await close(db);
	}
});

test('date range filter matches notes inside the range', async () => {
	const { db, repository } = await createRepository();

	try {
		await insertNote(db, {
			userId: 'user-1',
			note: 'Range review note',
			dateAdded: '2026-04-01T12:00:00.000Z',
			status: 'included',
			lastIncludedDate: '2026-04-30T19:00:00.000Z',
		});
		await insertNote(db, {
			userId: 'user-2',
			note: 'Range review note',
			dateAdded: '2026-04-15T12:00:00.000Z',
			status: 'pending',
		});

		const notes = await repository.searchNotes({ query: 'range', startDate: '2026-04-10', endDate: '2026-04-20' });

		assert.deepEqual(
			notes.map((note) => note.userId),
			['user-2']
		);
	} finally {
		await close(db);
	}
});

test('text search treats LIKE wildcards as literal search text', async () => {
	const { db, repository } = await createRepository();

	try {
		await insertNote(db, { userId: 'user-1', note: '100% memorized', dateAdded: '2026-04-15T12:00:00.000Z', status: 'pending' });
		await insertNote(db, { userId: 'user-2', note: '1000 memorized', dateAdded: '2026-04-15T13:00:00.000Z', status: 'pending' });

		const notes = await repository.searchNotes({ query: '100%' });

		assert.deepEqual(
			notes.map((note) => note.note),
			['100% memorized']
		);
	} finally {
		await close(db);
	}
});

async function createRepository(): Promise<{ db: sqlite3.Database; repository: NotesRepository }> {
	const db = new sqlite3.Database(':memory:');
	await run(
		db,
		`
			CREATE TABLE notes (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				userId TEXT NOT NULL,
				note TEXT NOT NULL,
				dateAdded TEXT NOT NULL,
				status TEXT DEFAULT 'pending',
				lastIncludedDate TEXT
			)
		`
	);

	return { db, repository: new NotesRepository(db) };
}

function insertNote(
	db: sqlite3.Database,
	note: { userId: string; note: string; dateAdded: string; status?: string | null; lastIncludedDate?: string | null }
): Promise<void> {
	return run(db, `INSERT INTO notes (userId, note, dateAdded, status, lastIncludedDate) VALUES (?, ?, ?, ?, ?)`, [
		note.userId,
		note.note,
		note.dateAdded,
		note.status ?? 'pending',
		note.lastIncludedDate ?? null,
	]);
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
