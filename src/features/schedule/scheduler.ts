import { Client } from 'discord.js';
import * as cron from 'node-cron';
import { configurationRepository, scheduleRepository } from '../../storage/sqlite';
import { scheduleStatuses, scheduleTypes } from '../../storage/sqlite/repositories/ScheduleRepository';
import type { Schedule } from '../../storage/sqlite/repositories/ScheduleRepository';
import { logger } from '../../observability/logging/logger';
import { normalizeTimeZone } from '../../shared/time';
import { buildScheduleFireMessage } from './mentions';
import { buildScheduleCronEntries, isOneTimeSchedulePast, shouldExecuteScheduleNow } from './resolver';

export let scheduledGenericScheduleJobs: cron.ScheduledTask[] = [];

export async function scheduleGenericSchedules(client: Client): Promise<void> {
	stopGenericScheduleJobs();

	const configuration = await configurationRepository.getConfiguration();
	const timezone = normalizeTimeZone(configuration.timezone);
	if (!timezone) {
		logger.warn(`Invalid timezone configured for generic schedules: ${configuration.timezone}`, undefined, {
			operationType: 'schedule_generic_schedules',
			additionalData: { timezone: configuration.timezone },
		});
		return;
	}

	const schedules = await scheduleRepository.getActiveSchedules();
	const now = new Date();
	for (const schedule of schedules) {
		if (schedule.type === scheduleTypes.ONE_TIME && isOneTimeSchedulePast(schedule, timezone, now)) {
			await scheduleRepository.markScheduleCompleted(schedule.id);
			continue;
		}

		const entries = buildScheduleCronEntries(schedule, timezone, now);
		for (const entry of entries) {
			const job = cron.schedule(
				entry.cronTime,
				async () => {
					await executeGenericSchedule(client, schedule.id);
				},
				{ timezone }
			);

			scheduledGenericScheduleJobs.push(job);
			logger.recordSchedulerEvent('scheduled', {
				cronTime: entry.cronTime,
				timezone,
				scheduleId: schedule.id,
				scheduleName: schedule.name,
				weekday: entry.weekday,
				stage: 'generic_schedule',
			});
		}
	}
}

export function stopGenericScheduleJobs(): void {
	for (const job of scheduledGenericScheduleJobs) {
		job.stop();
	}

	if (scheduledGenericScheduleJobs.length > 0) {
		logger.recordSchedulerEvent('stopped', { stage: 'generic_schedule', count: scheduledGenericScheduleJobs.length });
	}

	scheduledGenericScheduleJobs = [];
}

export async function executeGenericSchedule(client: Client, scheduleId: number, now: Date = new Date()): Promise<void> {
	const configuration = await configurationRepository.getConfiguration();
	const timezone = normalizeTimeZone(configuration.timezone);
	if (!timezone) {
		logger.warn(`Invalid timezone configured during generic schedule execution: ${configuration.timezone}`, undefined, {
			operationType: 'generic_schedule_execution',
			additionalData: { timezone: configuration.timezone, scheduleId },
		});
		return;
	}

	const schedule = await scheduleRepository.getScheduleById(scheduleId);
	if (!schedule || schedule.status !== scheduleStatuses.ACTIVE) {
		return;
	}

	if (!shouldExecuteScheduleNow(schedule, timezone, now)) {
		return;
	}

	try {
		await sendScheduleMessage(client, schedule);
		await scheduleRepository.recordScheduleRun(schedule.id, now.toISOString());

		if (schedule.type === scheduleTypes.ONE_TIME) {
			await scheduleRepository.markScheduleCompleted(schedule.id);
		}

		logger.recordSchedulerEvent('executed', {
			scheduleId: schedule.id,
			scheduleName: schedule.name,
			stage: 'generic_schedule',
		});
	} catch (error) {
		logger.error('Failed to execute generic schedule', error as Error, undefined, {
			operationType: 'generic_schedule_execution',
			operationStatus: 'failure',
			additionalData: { scheduleId: schedule.id, scheduleName: schedule.name },
		});
		logger.recordSchedulerEvent('failed', {
			scheduleId: schedule.id,
			scheduleName: schedule.name,
			stage: 'generic_schedule',
		});
	}
}

async function sendScheduleMessage(client: Client, schedule: Schedule): Promise<void> {
	const channelId = process.env.CHANNEL_ID;
	if (!channelId) {
		throw new Error('CHANNEL_ID is not configured for generic schedule messages.');
	}

	const channel = client.channels.cache.get(channelId);
	if (!channel || !('send' in channel)) {
		throw new Error('Configured reminder channel was not found or is not sendable for generic schedule messages.');
	}

	await (channel as any).send({
		content: buildScheduleFireMessage(schedule),
		allowedMentions: { parse: ['users', 'roles'] },
	});
}
