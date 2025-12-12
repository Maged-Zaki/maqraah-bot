import { Client } from 'discord.js';
import * as cron from 'node-cron';
import { configurationRepository, progressRepository, notesRepository } from './database';
import { buildReminderMessage } from './utils';

export let scheduledJob: cron.ScheduledTask | null = null;

export async function scheduleReminder(client: Client) {
	const configuration = await configurationRepository.getConfiguration();
	if (scheduledJob) {
		scheduledJob.stop();
		scheduledJob = null;
	}

	const cronTime = parseTimeToCron(configuration.dailyTime);
	if (!cronTime) {
		console.log('Invalid time format, skipping reminder.');
		return;
	}

	scheduledJob = cron.schedule(
		cronTime,
		async () => {
			const configuration = await configurationRepository.getConfiguration();
			const progress = await progressRepository.getProgress();
			const channel = client.channels.cache.get(process.env.CHANNEL_ID!);
			const notes = await notesRepository.getAllNotes();
			const message = buildReminderMessage(configuration, progress, notes, true);
			await notesRepository.deleteAllNotes();
			await (channel as any).send(message);
		},
		{
			timezone: configuration.timezone,
		}
	);
}

export async function overrideNextReminder(client: Client, newTime: string) {
	if (scheduledJob) {
		scheduledJob.stop();
		scheduledJob = null;
	}

	const configuration = await configurationRepository.getConfiguration();
	const cronTime = parseTimeToCron(newTime);
	if (!cronTime) {
		console.log('Invalid time format, skipping reminder.');
		return;
	}

	const tempJob = cron.schedule(
		cronTime,
		async () => {
			const configuration = await configurationRepository.getConfiguration();
			const progress = await progressRepository.getProgress();
			const channel = client.channels.cache.get(process.env.CHANNEL_ID!);
			const notes = await notesRepository.getAllNotes();
			const message = buildReminderMessage(configuration, progress, notes, true);
			if (notes.length > 0) {
				const noteIds = notes.map((n) => n.id);
				await notesRepository.deleteNotes(noteIds);
			}
			await (channel as any).send(message);
			tempJob.stop();
			scheduleReminder(client);
		},
		{
			timezone: configuration.timezone,
		}
	);
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
