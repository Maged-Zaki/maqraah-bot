import sqlite3 from 'sqlite3';

export interface Migration {
	name: string;
	up(db: sqlite3.Database): Promise<void>;
}
