import sqlite3 from 'sqlite3';
import { logger } from '../logger';

export interface Note {
	id: number;
	userId: string;
	note: string;
	dateAdded: string;
	status?: string;
	lastIncludedDate?: string;
}

export class NotesRepository {
	constructor(private db: sqlite3.Database) {}

	async addNote(userId: string, note: string): Promise<void> {
		const startTime = Date.now();
		return new Promise((resolve, reject) => {
			this.db.run(`INSERT INTO notes (userId, note, dateAdded) VALUES (?, ?, ?)`, [userId, note, new Date().toISOString()], function (err) {
				const duration = Date.now() - startTime;
				if (err) {
					logger.error('Failed to add note', err, undefined, { operationType: 'database_create', operationStatus: 'failure', duration });
					logger.recordDatabaseEvent('create', 'notes', duration, false, err.message);
					reject(err);
				} else {
					logger.debug('Note added successfully', undefined, { operationType: 'database_create', operationStatus: 'success', duration });
					logger.recordDatabaseEvent('create', 'notes', duration, true);
					resolve();
				}
			});
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
					logger.debug(`Retrieved ${rows.length} notes`, undefined, { operationType: 'database_read', operationStatus: 'success', duration });
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
					logger.debug(`Retrieved ${rows.length} notes for user ${userId}`, undefined, {
						operationType: 'database_read',
						operationStatus: 'success',
						duration,
					});
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
					logger.debug(`Deleted ${ids.length} notes`, undefined, { operationType: 'database_delete', operationStatus: 'success', duration });
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
					logger.debug('Deleted all notes', undefined, { operationType: 'database_delete', operationStatus: 'success', duration });
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
					logger.debug(`Retrieved ${rows.length} notes with status ${status}`, undefined, {
						operationType: 'database_read',
						operationStatus: 'success',
						duration,
					});
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
					logger.debug(`Updated note ${noteId} status to ${status}`, undefined, {
						operationType: 'database_update',
						operationStatus: 'success',
						duration,
					});
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
					logger.debug(`Updated ${noteIds.length} notes status to ${status}`, undefined, {
						operationType: 'database_update',
						operationStatus: 'success',
						duration,
					});
					logger.recordDatabaseEvent('update', 'notes', duration, true);
					resolve();
				}
			});
		});
	}

	async updateNotesStatusWithDate(noteIds: number[], status: string, lastIncludedDate: string): Promise<void> {
		const startTime = Date.now();
		const placeholders = noteIds.map(() => '?').join(',');
		return new Promise((resolve, reject) => {
			this.db.run(
				`UPDATE notes SET status = ?, lastIncludedDate = ? WHERE id IN (${placeholders})`,
				[status, lastIncludedDate, ...noteIds],
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
						logger.debug(`Updated ${noteIds.length} notes status to ${status} with date ${lastIncludedDate}`, undefined, {
							operationType: 'database_update',
							operationStatus: 'success',
							duration,
						});
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
					logger.debug(`Retrieved ${rows.length} included notes`, undefined, {
						operationType: 'database_read',
						operationStatus: 'success',
						duration,
					});
					logger.recordDatabaseEvent('read', 'notes', duration, true);
					resolve(rows);
				}
			});
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
					logger.debug(`Carried over ${noteIds.length} notes to pending status`, undefined, {
						operationType: 'database_update',
						operationStatus: 'success',
						duration,
					});
					logger.recordDatabaseEvent('update', 'notes', duration, true);
					resolve();
				}
			});
		});
	}
}
