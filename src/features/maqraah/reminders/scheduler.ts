import { Client, MessageFlags } from 'discord.js';
import * as cron from 'node-cron';
import { configurationRepository, notesRepository, progressRepository, reminderEventsRepository } from '../../../storage/sqlite';
import { logger } from '../../../observability/logging/logger';
import { normalizeTimeZone, parseTimeToCron } from '../../../shared/time';
import { announcePendingAttendance, type AttendanceAnnouncementChannel } from './attendance';
import { buildCurrentQuranPagePrompt, buildReminderActionRows } from './components';
import { buildReminderStageSchedules, reminderStages, ReminderStage, ReminderStageSchedule } from './cadence';
import { buildPreReminderMessage, buildReminderMessages } from './messages';
import { getReminderSessionId } from './sessionId';

export let scheduledJob: cron.ScheduledTask | null = null;
export let scheduledJobs: cron.ScheduledTask[] = [];

type PreReminderChannel = Pick<AttendanceAnnouncementChannel, 'id' | 'messages'> & {
	send: (options: { content: string; components?: ReturnType<typeof buildReminderActionRows> }) => Promise<unknown>;
};

export async function scheduleReminder(client: Client) {
	logger.info('Scheduling reminder cadence', undefined, { operationType: 'schedule_reminder' });

	stopScheduledJobs();

	const configuration = await configurationRepository.getConfiguration();
	const timezone = normalizeTimeZone(configuration.timezone);
	if (!timezone) {
		logger.warn(`Invalid timezone configured: ${configuration.timezone}, skipping reminders`, undefined, {
			additionalData: { timezone: configuration.timezone },
		});
		return;
	}

	const schedules = buildReminderStageSchedules(configuration);

	if (schedules.length === 0) {
		logger.warn(`Invalid time format or all reminder stages disabled: ${configuration.dailyTime}, skipping reminders`, undefined, {
			additionalData: { time: configuration.dailyTime },
		});
		return;
	}

	for (const schedule of schedules) {
		logger.info(`Scheduling ${schedule.stage} reminder job with cron: ${schedule.cronTime}`, undefined, {
			additionalData: { cronTime: schedule.cronTime, timezone, stage: schedule.stage },
		});

		const job = cron.schedule(
			schedule.cronTime,
			async () => {
				await executeReminderStage(client, schedule);
			},
			{
				timezone,
			}
		);

		scheduledJobs.push(job);
		if (schedule.stage === reminderStages.MAIN) {
			scheduledJob = job;
		}

		logger.recordSchedulerEvent('scheduled', { cronTime: schedule.cronTime, timezone, stage: schedule.stage });
	}
}

export async function overrideNextReminder(client: Client, newTime: string) {
	logger.info('Overriding next reminder time', undefined, { additionalData: { newTime } });

	stopScheduledJobs();

	const configuration = await configurationRepository.getConfiguration();
	const timezone = normalizeTimeZone(configuration.timezone);
	if (!timezone) {
		logger.warn(`Invalid timezone configured for override: ${configuration.timezone}`, undefined, {
			additionalData: { timezone: configuration.timezone },
		});
		return;
	}

	const cronTime = parseTimeToCron(newTime);
	if (!cronTime) {
		logger.warn(`Invalid time format for override: ${newTime}`, undefined, { additionalData: { newTime } });
		return;
	}

	const schedule: ReminderStageSchedule = {
		stage: reminderStages.MAIN,
		cronTime,
		sessionDateOffsetMinutes: 0,
	};

	logger.info(`Scheduling one-time reminder with cron: ${cronTime}`, undefined, { additionalData: { cronTime, timezone } });

	let tempJob: cron.ScheduledTask;
	tempJob = cron.schedule(
		cronTime,
		async () => {
			await executeReminderStage(client, schedule, true);
			tempJob.stop();
			scheduledJobs = scheduledJobs.filter((job) => job !== tempJob);
			scheduledJob = null;
			logger.info('One-time reminder job stopped, rescheduling regular reminder');
			scheduleReminder(client);
		},
		{
			timezone,
		}
	);

	scheduledJob = tempJob;
	scheduledJobs.push(tempJob);
	logger.recordSchedulerEvent('scheduled', { cronTime, timezone, isOverride: true, stage: reminderStages.MAIN });
}

async function executeReminderStage(client: Client, schedule: ReminderStageSchedule, isOverride: boolean = false): Promise<void> {
	const startTime = Date.now();
	const stage = schedule.stage;
	logger.info(`Executing ${stage} reminder`, undefined, { operationType: 'reminder_execution', additionalData: { stage, isOverride } });

	try {
		const configuration = await configurationRepository.getConfiguration();
		const timezone = normalizeTimeZone(configuration.timezone);
		if (!timezone) {
			logger.warn(`Invalid timezone configured during reminder execution: ${configuration.timezone}`, undefined, {
				additionalData: { timezone: configuration.timezone, stage, isOverride },
			});
			return;
		}

		const sessionStart = new Date(Date.now() + schedule.sessionDateOffsetMinutes * 60_000);
		const sessionId = getReminderSessionId(sessionStart, timezone);

		const isNewReminderEvent = await reminderEventsRepository.recordSentEventIfNew(sessionId, stage, sessionStart.toISOString());
		if (!isNewReminderEvent) {
			logger.info('Skipping duplicate reminder event', undefined, {
				additionalData: { sessionId, stage },
			});
			return;
		}

		await sendReminderStage(client, stage, sessionId);

		const duration = Date.now() - startTime;
		logger.info(`${stage} reminder sent successfully`, undefined, { additionalData: { duration, stage, isOverride } });
		logger.recordSchedulerEvent('executed', { duration, stage, isOverride });
	} catch (error) {
		const duration = Date.now() - startTime;
		logger.error(`Failed to execute ${stage} reminder`, error as Error, undefined, {
			operationType: 'reminder_execution',
			operationStatus: 'failure',
			duration,
			additionalData: {
				guildId: process.env.GUILD_ID,
				channelId: process.env.CHANNEL_ID,
				stage,
				isOverride,
			},
		});
		logger.recordReminderSentEvent(process.env.GUILD_ID!, process.env.CHANNEL_ID!, 0, false);
		logger.recordSchedulerEvent('failed', { error: (error as Error).message, duration, stage, isOverride });
	}
}

async function sendReminderStage(client: Client, stage: ReminderStage, sessionId: string): Promise<void> {
	const configuration = await configurationRepository.getConfiguration();
	const channel = client.channels.cache.get(process.env.CHANNEL_ID!);

	if (!channel || !('send' in channel)) {
		throw new Error('Configured reminder channel was not found or is not sendable.');
	}

	switch (stage) {
		case reminderStages.PRE:
			await sendPreReminderStage(channel as any, configuration, sessionId);
			logger.recordReminderSentEvent(process.env.GUILD_ID!, process.env.CHANNEL_ID!, 0, true);
			return;
		case reminderStages.MAIN:
			await sendMainReminder(channel, configuration, sessionId);
			return;
	}
}

export async function sendPreReminderStage(
	channel: PreReminderChannel,
	configuration: Awaited<ReturnType<typeof configurationRepository.getConfiguration>>,
	sessionId: string
): Promise<void> {
	await channel.send({ content: buildPreReminderMessage(configuration), components: buildReminderActionRows(sessionId) });
	await announcePendingAttendance(channel, sessionId);
}

export async function sendMainReminder(channel: any, configuration: Awaited<ReturnType<typeof configurationRepository.getConfiguration>>, sessionId: string): Promise<void> {
	const progress = await progressRepository.getProgress();
	const notes = await notesRepository.getNotesByStatus('pending');
	const { mainMessage, notesMessages } = buildReminderMessages(configuration, progress, notes);
	const currentPage = progress.currentPage;

	if (notes.length > 0) {
		logger.info(`Marking ${notes.length} notes as included`, undefined, { additionalData: { noteCount: notes.length } });
		const noteIds = notes.map((n) => n.id);
		await notesRepository.updateNotesStatusWithDate(noteIds, 'included', new Date().toISOString(), sessionId);
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

	await channel.send({ content: mainMessage, flags: MessageFlags.SuppressEmbeds });

	for (let i = 0; i < notesMessages.length; i++) {
		await channel.send({
			content: notesMessages[i],
		});
	}

	await channel.send(buildCurrentQuranPagePrompt(sessionId, currentPage));

	logger.recordReminderSentEvent(process.env.GUILD_ID!, process.env.CHANNEL_ID!, notes.length, true);
}

function stopScheduledJobs(): void {
	for (const job of scheduledJobs) {
		job.stop();
	}

	if (scheduledJob && !scheduledJobs.includes(scheduledJob)) {
		scheduledJob.stop();
	}

	scheduledJobs = [];
	scheduledJob = null;
}
