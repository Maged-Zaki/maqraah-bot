import sqlite3 from 'sqlite3';
import { ConfigurationRepository } from './repositories/ConfigurationRepository';
import { ProgressRepository } from './repositories/ProgressRepository';
import { NotesRepository } from './repositories/NotesRepository';
import { AttendanceRepository } from './repositories/AttendanceRepository';
import { AttendanceAnnouncementMessageRepository } from './repositories/AttendanceAnnouncementMessageRepository';
import { ReminderEventsRepository } from './repositories/ReminderEventsRepository';
import { ScheduleRepository } from './repositories/ScheduleRepository';
import { ReminderCategoryRoleRepository } from './repositories/ReminderCategoryRoleRepository';
import { ReminderSettingsRepository } from './repositories/ReminderSettingsRepository';
import { HijriCalendarCacheRepository } from './repositories/HijriCalendarCacheRepository';
import { SubscriptionReminderEventsRepository } from './repositories/SubscriptionReminderEventsRepository';
import { runMigrations } from './migrations/runner';
import { logger } from '../../observability/logging/logger';

if (!process.env.DATABASE_PATH) {
	logger.fatal('DATABASE_PATH is not defined in environment variables');
	throw new Error('DATABASE_PATH is not defined in environment variables.');
}

const db = new sqlite3.Database(process.env.DATABASE_PATH);

logger.info('Initializing database', undefined, { additionalData: { databasePath: process.env.DATABASE_PATH } });

export const dbReady = runMigrations(db);

db.on('error', (err) => {
	logger.error('Database error occurred', err);
});

export const configurationRepository = new ConfigurationRepository(db);
export const progressRepository = new ProgressRepository(db);
export const notesRepository: NotesRepository = new NotesRepository(db);
export const attendanceRepository = new AttendanceRepository(db);
export const attendanceAnnouncementMessageRepository = new AttendanceAnnouncementMessageRepository(db);
export const reminderEventsRepository = new ReminderEventsRepository(db);
export const scheduleRepository = new ScheduleRepository(db);
export const reminderCategoryRoleRepository = new ReminderCategoryRoleRepository(db);
export const reminderSettingsRepository = new ReminderSettingsRepository(db);
export const hijriCalendarCacheRepository = new HijriCalendarCacheRepository(db);
export const subscriptionReminderEventsRepository = new SubscriptionReminderEventsRepository(db);
