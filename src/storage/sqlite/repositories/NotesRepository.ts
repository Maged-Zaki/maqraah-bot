import sqlite3 from 'sqlite3';
import { logger } from '../../../observability/logging/logger';

export interface Note {
	id: number;
	userId: string;
	note: string;
	dateAdded: string;
	status?: string;
	lastIncludedDate?: string;
	lastIncludedSessionId?: string;
	isAnonymous?: boolean | number | null;
}

export type NoteStatus = 'pending' | 'included';

export interface NoteSearchCriteria {
	query?: string;
	userId?: string;
	includeAnonymous?: boolean;
	status?: NoteStatus;
	startDate?: string;
	endDate?: string;
}

export interface AddNoteOptions {
	isAnonymous?: boolean;
}

export class NotesRepository {
	constructor(private db: sqlite3.Database) {}

	async addNote(userId: string, note: string, options: AddNoteOptions = {}): Promise<void> {
		const startTime = Date.now();
		const isAnonymous = options.isAnonymous ? 1 : 0;
		return new Promise((resolve, reject) => {
			this.db.run(
				`INSERT INTO notes (userId, note, dateAdded, isAnonymous) VALUES (?, ?, ?, ?)`,
				[userId, note, new Date().toISOString(), isAnonymous],
				function (err) {
					const duration = Date.now() - startTime;
					if (err) {
						logger.error('Failed to add note', err, undefined, { operationType: 'database_create', operationStatus: 'failure', duration });
						logger.recordDatabaseEvent('create', 'notes', duration, false, err.message);
						reject(err);
					} else {
						logger.recordDatabaseEvent('create', 'notes', duration, true);
						resolve();
					}
				}
			);
		});
	}

	async getAllNotes(): Promise<Note[]> {
		const startTime = Date.now();
		return new Promise((resolve, reject) => {
			this.db.all(`SELECT * FROM notes`, (err, rows: Note[]) => {
				const duration = Date.now() - startTime;
				if (err) {
					logger.error('Failed to get all notes', err, undefined, { operationType: 'database_read', operationStatus: 'failure', duration });
					logger.recordDatabaseEvent('read', 'notes', duration, false, err.message);
					reject(err);
				} else {
					logger.recordDatabaseEvent('read', 'notes', duration, true);
					resolve(rows);
				}
			});
		});
	}

	async getNotesByUserId(userId: string): Promise<Note[]> {
		const startTime = Date.now();
		return new Promise((resolve, reject) => {
			this.db.all(`SELECT * FROM notes WHERE userId = ?`, [userId], (err, rows: Note[]) => {
				const duration = Date.now() - startTime;
				if (err) {
					logger.error('Failed to get notes by user ID', err, undefined, { operationType: 'database_read', operationStatus: 'failure', duration });
					logger.recordDatabaseEvent('read', 'notes', duration, false, err.message);
					reject(err);
				} else {
					logger.recordDatabaseEvent('read', 'notes', duration, true);
					resolve(rows);
				}
			});
		});
	}

	async deleteNotes(ids: number[]): Promise<void> {
		const startTime = Date.now();
		const placeholders = ids.map(() => '?').join(',');
		return new Promise((resolve, reject) => {
			this.db.run(`DELETE FROM notes WHERE id IN (${placeholders})`, ids, function (err) {
				const duration = Date.now() - startTime;
				if (err) {
					logger.error('Failed to delete notes', err, undefined, { operationType: 'database_delete', operationStatus: 'failure', duration });
					logger.recordDatabaseEvent('delete', 'notes', duration, false, err.message);
					reject(err);
				} else {
					logger.recordDatabaseEvent('delete', 'notes', duration, true);
					resolve();
				}
			});
		});
	}

	async deleteAllNotes(): Promise<void> {
		const startTime = Date.now();
		return new Promise((resolve, reject) => {
			this.db.run(`DELETE FROM notes`, function (err) {
				const duration = Date.now() - startTime;
				if (err) {
					logger.error('Failed to delete all notes', err, undefined, { operationType: 'database_delete', operationStatus: 'failure', duration });
					logger.recordDatabaseEvent('delete', 'notes', duration, false, err.message);
					reject(err);
				} else {
					logger.recordDatabaseEvent('delete', 'notes', duration, true);
					resolve();
				}
			});
		});
	}

	async getNotesByStatus(status: string): Promise<Note[]> {
		const startTime = Date.now();
		return new Promise((resolve, reject) => {
			this.db.all(`SELECT * FROM notes WHERE status = ?`, [status], (err, rows: Note[]) => {
				const duration = Date.now() - startTime;
				if (err) {
					logger.error('Failed to get notes by status', err, undefined, { operationType: 'database_read', operationStatus: 'failure', duration });
					logger.recordDatabaseEvent('read', 'notes', duration, false, err.message);
					reject(err);
				} else {
					logger.recordDatabaseEvent('read', 'notes', duration, true);
					resolve(rows);
				}
			});
		});
	}

	async updateNoteStatus(noteId: number, status: string): Promise<void> {
		const startTime = Date.now();
		return new Promise((resolve, reject) => {
			this.db.run(`UPDATE notes SET status = ? WHERE id = ?`, [status, noteId], function (err) {
				const duration = Date.now() - startTime;
				if (err) {
					logger.error('Failed to update note status', err, undefined, { operationType: 'database_update', operationStatus: 'failure', duration });
					logger.recordDatabaseEvent('update', 'notes', duration, false, err.message);
					reject(err);
				} else {
					logger.recordDatabaseEvent('update', 'notes', duration, true);
					resolve();
				}
			});
		});
	}

	async updateNotesStatus(noteIds: number[], status: string): Promise<void> {
		const startTime = Date.now();
		const placeholders = noteIds.map(() => '?').join(',');
		return new Promise((resolve, reject) => {
			this.db.run(`UPDATE notes SET status = ? WHERE id IN (${placeholders})`, [status, ...noteIds], function (err) {
				const duration = Date.now() - startTime;
				if (err) {
					logger.error('Failed to update notes status', err, undefined, { operationType: 'database_update', operationStatus: 'failure', duration });
					logger.recordDatabaseEvent('update', 'notes', duration, false, err.message);
					reject(err);
				} else {
					logger.recordDatabaseEvent('update', 'notes', duration, true);
					resolve();
				}
			});
		});
	}

	async updateNotesStatusWithDate(noteIds: number[], status: string, lastIncludedDate: string, lastIncludedSessionId?: string): Promise<void> {
		const startTime = Date.now();
		const placeholders = noteIds.map(() => '?').join(',');
		const sessionIdUpdate = lastIncludedSessionId ? ', lastIncludedSessionId = ?' : '';
		const params = lastIncludedSessionId ? [status, lastIncludedDate, lastIncludedSessionId, ...noteIds] : [status, lastIncludedDate, ...noteIds];
		return new Promise((resolve, reject) => {
			this.db.run(
				`UPDATE notes SET status = ?, lastIncludedDate = ?${sessionIdUpdate} WHERE id IN (${placeholders})`,
				params,
				function (err) {
					const duration = Date.now() - startTime;
					if (err) {
						logger.error('Failed to update notes status with date', err, undefined, {
							operationType: 'database_update',
							operationStatus: 'failure',
							duration,
						});
						logger.recordDatabaseEvent('update', 'notes', duration, false, err.message);
						reject(err);
					} else {
						logger.recordDatabaseEvent('update', 'notes', duration, true);
						resolve();
					}
				}
			);
		});
	}

	async getIncludedNotes(): Promise<Note[]> {
		const startTime = Date.now();
		return new Promise((resolve, reject) => {
			this.db.all(`SELECT * FROM notes WHERE status = 'included'`, (err, rows: Note[]) => {
				const duration = Date.now() - startTime;
				if (err) {
					logger.error('Failed to get included notes', err, undefined, { operationType: 'database_read', operationStatus: 'failure', duration });
					logger.recordDatabaseEvent('read', 'notes', duration, false, err.message);
					reject(err);
				} else {
					logger.recordDatabaseEvent('read', 'notes', duration, true);
					resolve(rows);
				}
			});
		});
	}

	async getIncludedNotesBySessionId(sessionId: string): Promise<Note[]> {
		const startTime = Date.now();
		return new Promise((resolve, reject) => {
			this.db.all(
				`SELECT * FROM notes WHERE status = 'included' AND lastIncludedSessionId = ? ORDER BY dateAdded ASC, id ASC`,
				[sessionId],
				(err, rows: Note[]) => {
					const duration = Date.now() - startTime;
					if (err) {
						logger.error('Failed to get included notes by session ID', err, undefined, {
							operationType: 'database_read',
							operationStatus: 'failure',
							duration,
						});
						logger.recordDatabaseEvent('read', 'notes', duration, false, err.message);
						reject(err);
					} else {
						logger.recordDatabaseEvent('read', 'notes', duration, true);
						resolve(rows);
					}
				}
			);
		});
	}

	async carryOverNotes(noteIds: number[]): Promise<void> {
		const startTime = Date.now();
		const placeholders = noteIds.map(() => '?').join(',');
		return new Promise((resolve, reject) => {
			this.db.run(`UPDATE notes SET status = 'pending' WHERE id IN (${placeholders})`, noteIds, function (err) {
				const duration = Date.now() - startTime;
				if (err) {
					logger.error('Failed to carry over notes', err, undefined, { operationType: 'database_update', operationStatus: 'failure', duration });
					logger.recordDatabaseEvent('update', 'notes', duration, false, err.message);
					reject(err);
				} else {
					logger.recordDatabaseEvent('update', 'notes', duration, true);
					resolve();
				}
			});
		});
	}

	async getNotesByDate(dateString: string): Promise<Note[]> {
		const startTime = Date.now();
		return new Promise((resolve, reject) => {
			this.db.all(
				`SELECT * FROM notes WHERE date(dateAdded) = ? OR date(lastIncludedDate) = ? ORDER BY dateAdded DESC`,
				[dateString, dateString],
				(err, rows: Note[]) => {
					const duration = Date.now() - startTime;
					if (err) {
						logger.error('Failed to get notes by date', err, undefined, { operationType: 'database_read', operationStatus: 'failure', duration });
						logger.recordDatabaseEvent('read', 'notes', duration, false, err.message);
						reject(err);
					} else {
						logger.recordDatabaseEvent('read', 'notes', duration, true);
						resolve(rows);
					}
				}
			);
		});
	}

	async searchNotes(criteria: NoteSearchCriteria): Promise<Note[]> {
		const startTime = Date.now();
		const conditions: string[] = [];
		const params: string[] = [];
		const query = criteria.query?.trim();

		if (query) {
			conditions.push(`note LIKE ? ESCAPE '\\'`);
			params.push(`%${escapeLikePattern(query)}%`);
		}

		if (criteria.userId) {
			conditions.push(`userId = ?`);
			params.push(criteria.userId);

			if (!criteria.includeAnonymous) {
				conditions.push(`COALESCE(isAnonymous, 0) = 0`);
			}
		}

		if (criteria.status) {
			if (criteria.status === 'pending') {
				conditions.push(`(status = ? OR status IS NULL)`);
			} else {
				conditions.push(`status = ?`);
			}
			params.push(criteria.status);
		}

		if (criteria.startDate && criteria.endDate) {
			conditions.push(`((date(dateAdded) BETWEEN ? AND ?) OR (date(lastIncludedDate) BETWEEN ? AND ?))`);
			params.push(criteria.startDate, criteria.endDate, criteria.startDate, criteria.endDate);
		} else if (criteria.startDate) {
			conditions.push(`(date(dateAdded) >= ? OR date(lastIncludedDate) >= ?)`);
			params.push(criteria.startDate, criteria.startDate);
		} else if (criteria.endDate) {
			conditions.push(`(date(dateAdded) <= ? OR date(lastIncludedDate) <= ?)`);
			params.push(criteria.endDate, criteria.endDate);
		}

		const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

		return new Promise((resolve, reject) => {
			this.db.all(
				`
					SELECT *
					FROM notes
					${whereClause}
					ORDER BY COALESCE(lastIncludedDate, dateAdded) DESC, dateAdded DESC, id DESC
				`,
				params,
				(err, rows: Note[]) => {
					const duration = Date.now() - startTime;
					if (err) {
						logger.error('Failed to search notes', err, undefined, { operationType: 'database_read', operationStatus: 'failure', duration });
						logger.recordDatabaseEvent('read', 'notes', duration, false, err.message);
						reject(err);
					} else {
						logger.recordDatabaseEvent('read', 'notes', duration, true);
						resolve(rows);
					}
				}
			);
		});
	}
}

function escapeLikePattern(value: string): string {
	return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}
