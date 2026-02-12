import { Client } from 'discord.js';
import * as cron from 'node-cron';
import { configurationRepository, progressRepository, notesRepository } from './database';
import { buildReminderMessages } from './utils';
import { logger } from './logger';

export let scheduledJob: cron.ScheduledTask | null = null;

export async function scheduleReminder(client: Client) {
	logger.info('Scheduling daily reminder', undefined, { operationType: 'schedule_reminder' });

	const configuration = await configurationRepository.getConfiguration();
	if (scheduledJob) {
		logger.info('Stopping existing scheduled job');
		scheduledJob.stop();
		scheduledJob = null;
	}

	const cronTime = parseTimeToCron(configuration.dailyTime);
	if (!cronTime) {
		logger.warn(`Invalid time format: ${configuration.dailyTime}, skipping reminder`, undefined, {
			additionalData: { time: configuration.dailyTime },
		});
		return;
	}

	logger.info(`Scheduling reminder job with cron: ${cronTime}`, undefined, { additionalData: { cronTime, timezone: configuration.timezone } });

	scheduledJob = cron.schedule(
		cronTime,
		async () => {
			const startTime = Date.now();
			logger.info('Executing scheduled reminder', undefined, { operationType: 'reminder_execution' });

			try {
				const configuration = await configurationRepository.getConfiguration();
				const progress = await progressRepository.getProgress();
				const channel = client.channels.cache.get(process.env.CHANNEL_ID!);
				const notes = await notesRepository.getNotesByStatus('pending');

				const { mainMessage, notesMessages } = buildReminderMessages(configuration, progress, notes);

				if (notes.length > 0) {
					logger.info(`Marking ${notes.length} notes as included`, undefined, { additionalData: { noteCount: notes.length } });
					const noteIds = notes.map((n) => n.id);
					await notesRepository.updateNotesStatusWithDate(noteIds, 'included', new Date().toISOString());
					// Record note events for each note included in reminder
					notes.forEach((note) => {
						logger.recordNoteEvent({
							userId: note.userId,
							guildId: process.env.GUILD_ID,
							channelId: process.env.CHANNEL_ID,
							noteContent: note.note,
							operation: 'included_in_reminder',
						});
					});
				}

				// Send main message first (with role mention)
				await (channel as any).send(mainMessage);

				// Send notes messages immediately after (no delay, no mentions)
				for (const msg of notesMessages) {
					await (channel as any).send(msg);
				}
				const duration = Date.now() - startTime;

				logger.info('Reminder sent successfully', undefined, { additionalData: { duration, noteCount: notes.length } });
				logger.recordReminderSentEvent(process.env.GUILD_ID!, process.env.CHANNEL_ID!, notes.length, true);
				logger.recordSchedulerEvent('executed', { noteCount: notes.length, duration });
			} catch (error) {
				const duration = Date.now() - startTime;
				logger.error('Failed to execute scheduled reminder', error as Error, undefined, {
					operationType: 'reminder_execution',
					operationStatus: 'failure',
					duration,
					additionalData: {
						guildId: process.env.GUILD_ID,
						channelId: process.env.CHANNEL_ID,
					},
				});
				logger.recordReminderSentEvent(process.env.GUILD_ID!, process.env.CHANNEL_ID!, 0, false);
				logger.recordSchedulerEvent('failed', { error: (error as Error).message, duration });
			}
		},
		{
			timezone: configuration.timezone,
		}
	);

	logger.recordSchedulerEvent('scheduled', { cronTime, timezone: configuration.timezone });
}

export async function overrideNextReminder(client: Client, newTime: string) {
	logger.info('Overriding next reminder time', undefined, { additionalData: { newTime } });

	if (scheduledJob) {
		logger.info('Stopping existing scheduled job for override');
		scheduledJob.stop();
		scheduledJob = null;
	}

	const configuration = await configurationRepository.getConfiguration();
	const cronTime = parseTimeToCron(newTime);
	if (!cronTime) {
		logger.warn(`Invalid time format for override: ${newTime}`, undefined, { additionalData: { newTime } });
		return;
	}

	logger.info(`Scheduling one-time reminder with cron: ${cronTime}`, undefined, { additionalData: { cronTime, timezone: configuration.timezone } });

	const tempJob = cron.schedule(
		cronTime,
		async () => {
			const startTime = Date.now();
			logger.info('Executing one-time reminder', undefined, { operationType: 'reminder_execution' });

			try {
				const configuration = await configurationRepository.getConfiguration();
				const progress = await progressRepository.getProgress();
				const channel = client.channels.cache.get(process.env.CHANNEL_ID!);
				const notes = await notesRepository.getNotesByStatus('pending');

				const { mainMessage, notesMessages } = buildReminderMessages(configuration, progress, notes);

				if (notes.length > 0) {
					logger.info(`Marking ${notes.length} notes as included in one-time reminder`, undefined, {
						additionalData: { noteCount: notes.length },
					});
					const noteIds = notes.map((n) => n.id);
					await notesRepository.updateNotesStatusWithDate(noteIds, 'included', new Date().toISOString());
					// Record note events for each note included in reminder
					notes.forEach((note) => {
						logger.recordNoteEvent({
							userId: note.userId,
							guildId: process.env.GUILD_ID,
							channelId: process.env.CHANNEL_ID,
							noteContent: note.note,
							operation: 'included_in_reminder',
						});
					});
				}

				// Send main message first (with role mention)
				await (channel as any).send(mainMessage);

				// Send notes messages immediately after (no delay, no mentions)
				for (const msg of notesMessages) {
					await (channel as any).send(msg);
				}
				const duration = Date.now() - startTime;

				logger.info('One-time reminder sent successfully', undefined, { additionalData: { duration, noteCount: notes.length } });
				logger.recordReminderSentEvent(process.env.GUILD_ID!, process.env.CHANNEL_ID!, notes.length, true);
				logger.recordSchedulerEvent('executed', { noteCount: notes.length, duration, isOverride: true });

				tempJob.stop();
				logger.info('One-time reminder job stopped, rescheduling regular reminder');
				scheduleReminder(client);
			} catch (error) {
				const duration = Date.now() - startTime;
				logger.error('Failed to execute one-time reminder', error as Error, undefined, {
					operationType: 'reminder_execution',
					operationStatus: 'failure',
					duration,
					additionalData: {
						guildId: process.env.GUILD_ID,
						channelId: process.env.CHANNEL_ID,
						isOverride: true,
					},
				});
				logger.recordReminderSentEvent(process.env.GUILD_ID!, process.env.CHANNEL_ID!, 0, false);
				logger.recordSchedulerEvent('failed', { error: (error as Error).message, duration, isOverride: true });
			}
		},
		{
			timezone: configuration.timezone,
		}
	);

	logger.recordSchedulerEvent('scheduled', { cronTime, timezone: configuration.timezone, isOverride: true });
}

function parseTimeToCron(time: string): string | null {
	// Assume format "HH:MM AM/PM"
	const match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
	if (!match) return null;
	let hour = parseInt(match[1]);
	const minute = match[2];
	const ampm = match[3].toUpperCase();
	if (ampm === 'PM' && hour !== 12) hour += 12;
	if (ampm === 'AM' && hour === 12) hour = 0;
	return `${minute} ${hour} * * *`;
}
