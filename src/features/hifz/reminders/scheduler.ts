import { Client, MessageFlags } from 'discord.js';
import * as cron from 'node-cron';
import { configurationRepository, hifzProgressRepository, notesRepository, reminderEventsRepository } from '../../../storage/sqlite';
import { logger } from '../../../observability/logging/logger';
import { normalizeTimeZone, parseTimeToCron } from '../../../shared/time';
import { announcePendingHifzAttendance, type AttendanceAnnouncementChannel } from './attendance';
import { buildCurrentHifzPagePrompt, buildHifzReminderActionRows } from './components';
import { buildHifzReminderStageSchedules, hifzReminderStages, HifzReminderStage, HifzReminderStageSchedule } from './cadence';
import { buildHifzReminderMessages, buildPreHifzReminderMessage } from './messages';
import { getHifzReminderSessionId } from './sessionId';

export let scheduledHifzJob: cron.ScheduledTask | null = null;
export let scheduledHifzJobs: cron.ScheduledTask[] = [];

type PreHifzReminderChannel = Pick<AttendanceAnnouncementChannel, 'id' | 'messages'> & {
	send: (options: { content: string; components?: ReturnType<typeof buildHifzReminderActionRows> }) => Promise<unknown>;
};

export async function scheduleHifzReminder(client: Client) {
	logger.info('Scheduling hifz reminder cadence', undefined, { operationType: 'schedule_hifz_reminder' });

	stopScheduledHifzJobs();

	const configuration = await configurationRepository.getConfiguration();
	const timezone = normalizeTimeZone(configuration.timezone);
	if (!timezone) {
		logger.warn(`Invalid timezone configured: ${configuration.timezone}, skipping hifz reminders`, undefined, {
			additionalData: { timezone: configuration.timezone },
		});
		return;
	}

	const schedules = buildHifzReminderStageSchedules(configuration);

	if (schedules.length === 0) {
		logger.warn(`Invalid time format or all hifz reminder stages disabled: ${configuration.hifzTime ?? '6:00 PM'}, skipping hifz reminders`, undefined, {
			additionalData: { time: configuration.hifzTime },
		});
		return;
	}

	for (const schedule of schedules) {
		logger.info(`Scheduling ${schedule.stage} hifz reminder job with cron: ${schedule.cronTime}`, undefined, {
			additionalData: { cronTime: schedule.cronTime, timezone, stage: schedule.stage },
		});

		const job = cron.schedule(
			schedule.cronTime,
			async () => {
				await executeHifzReminderStage(client, schedule);
			},
			{
				timezone,
			}
		);

		scheduledHifzJobs.push(job);
		if (schedule.stage === hifzReminderStages.MAIN) {
			scheduledHifzJob = job;
		}

		logger.recordSchedulerEvent('scheduled', { cronTime: schedule.cronTime, timezone, stage: schedule.stage, feature: 'hifz' });
	}
}

export async function overrideNextHifzReminder(client: Client, newTime: string) {
	logger.info('Overriding next hifz reminder time', undefined, { additionalData: { newTime } });

	stopScheduledHifzJobs();

	const configuration = await configurationRepository.getConfiguration();
	const timezone = normalizeTimeZone(configuration.timezone);
	if (!timezone) {
		logger.warn(`Invalid timezone configured for hifz override: ${configuration.timezone}`, undefined, {
			additionalData: { timezone: configuration.timezone },
		});
		return;
	}

	const cronTime = parseTimeToCron(newTime);
	if (!cronTime) {
		logger.warn(`Invalid time format for hifz override: ${newTime}`, undefined, { additionalData: { newTime } });
		return;
	}

	const schedule: HifzReminderStageSchedule = {
		stage: hifzReminderStages.MAIN,
		cronTime,
		sessionDateOffsetMinutes: 0,
	};

	logger.info(`Scheduling one-time hifz reminder with cron: ${cronTime}`, undefined, { additionalData: { cronTime, timezone } });

	let tempJob: cron.ScheduledTask;
	tempJob = cron.schedule(
		cronTime,
		async () => {
			await executeHifzReminderStage(client, schedule, true);
			tempJob.stop();
			scheduledHifzJobs = scheduledHifzJobs.filter((job) => job !== tempJob);
			scheduledHifzJob = null;
			logger.info('One-time hifz reminder job stopped, rescheduling regular hifz reminder');
			scheduleHifzReminder(client);
		},
		{
			timezone,
		}
	);

	scheduledHifzJob = tempJob;
	scheduledHifzJobs.push(tempJob);
	logger.recordSchedulerEvent('scheduled', { cronTime, timezone, isOverride: true, stage: hifzReminderStages.MAIN, feature: 'hifz' });
}

async function executeHifzReminderStage(client: Client, schedule: HifzReminderStageSchedule, isOverride: boolean = false): Promise<void> {
	const startTime = Date.now();
	const stage = schedule.stage;
	logger.info(`Executing ${stage} hifz reminder`, undefined, { operationType: 'hifz_reminder_execution', additionalData: { stage, isOverride } });

	try {
		const configuration = await configurationRepository.getConfiguration();
		const timezone = normalizeTimeZone(configuration.timezone);
		if (!timezone) {
			logger.warn(`Invalid timezone configured during hifz reminder execution: ${configuration.timezone}`, undefined, {
				additionalData: { timezone: configuration.timezone, stage, isOverride },
			});
			return;
		}

		const sessionStart = new Date(Date.now() + schedule.sessionDateOffsetMinutes * 60_000);
		const sessionId = getHifzReminderSessionId(sessionStart, timezone);

		const isNewReminderEvent = await reminderEventsRepository.recordSentEventIfNew(sessionId, stage, sessionStart.toISOString());
		if (!isNewReminderEvent) {
			logger.info('Skipping duplicate hifz reminder event', undefined, {
				additionalData: { sessionId, stage },
			});
			return;
		}

		await sendHifzReminderStage(client, stage, sessionId);

		const duration = Date.now() - startTime;
		logger.info(`${stage} hifz reminder sent successfully`, undefined, { additionalData: { duration, stage, isOverride } });
		logger.recordSchedulerEvent('executed', { duration, stage, isOverride, feature: 'hifz' });
	} catch (error) {
		const duration = Date.now() - startTime;
		logger.error(`Failed to execute ${stage} hifz reminder`, error as Error, undefined, {
			operationType: 'hifz_reminder_execution',
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
		logger.recordSchedulerEvent('failed', { error: (error as Error).message, duration, stage, isOverride, feature: 'hifz' });
	}
}

async function sendHifzReminderStage(client: Client, stage: HifzReminderStage, sessionId: string): Promise<void> {
	const configuration = await configurationRepository.getConfiguration();
	const channel = client.channels.cache.get(process.env.CHANNEL_ID!);

	if (!channel || !('send' in channel)) {
		throw new Error('Configured reminder channel was not found or is not sendable.');
	}

	switch (stage) {
		case hifzReminderStages.PRE:
			await sendPreHifzReminderStage(channel as any, configuration, sessionId);
			logger.recordReminderSentEvent(process.env.GUILD_ID!, process.env.CHANNEL_ID!, 0, true);
			return;
		case hifzReminderStages.MAIN:
			await sendMainHifzReminder(channel, configuration, sessionId);
			return;
	}
}

export async function sendPreHifzReminderStage(
	channel: PreHifzReminderChannel,
	configuration: Awaited<ReturnType<typeof configurationRepository.getConfiguration>>,
	sessionId: string
): Promise<void> {
	await channel.send({ content: buildPreHifzReminderMessage(configuration), components: buildHifzReminderActionRows(sessionId) });
	await announcePendingHifzAttendance(channel, sessionId);
}

export async function sendMainHifzReminder(channel: any, configuration: Awaited<ReturnType<typeof configurationRepository.getConfiguration>>, sessionId: string): Promise<void> {
	const progress = await hifzProgressRepository.getProgress();
	const notes = await notesRepository.getNotesByStatus('pending');
	const { mainMessage, notesMessages } = buildHifzReminderMessages(configuration, progress, notes);
	const currentPage = progress.currentPage;

	if (notes.length > 0) {
		logger.info(`Marking ${notes.length} notes as included for hifz`, undefined, { additionalData: { noteCount: notes.length } });
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

	await channel.send(buildCurrentHifzPagePrompt(sessionId, currentPage));

	logger.recordReminderSentEvent(process.env.GUILD_ID!, process.env.CHANNEL_ID!, notes.length, true);
}

function stopScheduledHifzJobs(): void {
	for (const job of scheduledHifzJobs) {
		job.stop();
	}

	if (scheduledHifzJob && !scheduledHifzJobs.includes(scheduledHifzJob)) {
		scheduledHifzJob.stop();
	}

	scheduledHifzJobs = [];
	scheduledHifzJob = null;
}
