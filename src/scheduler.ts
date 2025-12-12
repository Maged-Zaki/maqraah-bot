import { Client } from 'discord.js';
import * as cron from 'node-cron';
import { getConfig, getAllNotes, deleteNotes } from './database';
import { getNextPage, buildReminderMessage } from './utils';

export let scheduledJob: cron.ScheduledTask | null = null;

export async function scheduleReminder(client: Client) {
	const config = await getConfig();
	if (!config.roleId || !process.env.CHANNEL_ID) {
		console.log('Role or channel not set, skipping reminder setup.');
		return;
	}

	if (scheduledJob) {
		scheduledJob.stop();
		scheduledJob = null;
	}

	const cronTime = parseTimeToCron(config.dailyTime);
	if (!cronTime) {
		console.log('Invalid time format, skipping reminder.');
		return;
	}

	scheduledJob = cron.schedule(
		cronTime,
		async () => {
			const config = await getConfig();
			const channel = client.channels.cache.get(process.env.CHANNEL_ID!);
			if (channel && channel.isTextBased()) {
				const nextPage = getNextPage(config.lastPage);
				const notes = await getAllNotes();
				const message = buildReminderMessage(config, nextPage, notes, true);

				if (notes.length > 0) {
					const noteIds = notes.map((n) => n.id);
					await deleteNotes(noteIds);
				}

				await (channel as any).send(message);
			}
		},
		{
			timezone: config.timezone,
		}
	);
}

export async function overrideNextReminder(client: Client, newTime: string) {
	if (scheduledJob) {
		scheduledJob.stop();
		scheduledJob = null;
	}

	const config = await getConfig();
	const cronTime = parseTimeToCron(newTime);
	if (!cronTime) {
		console.log('Invalid time format, skipping reminder.');
		return;
	}

	const tempJob = cron.schedule(
		cronTime,
		async () => {
			const config = await getConfig();
			const channel = client.channels.cache.get(process.env.CHANNEL_ID!);
			if (channel && channel.isTextBased()) {
				const nextPage = getNextPage(config.lastPage);
				const notes = await getAllNotes();
				const message = buildReminderMessage(config, nextPage, notes, true);

				if (notes.length > 0) {
					const noteIds = notes.map((n) => n.id);
					await deleteNotes(noteIds);
				}

				await (channel as any).send(message);
				tempJob.stop();
				scheduleReminder(client);
			}
		},
		{
			timezone: config.timezone,
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
