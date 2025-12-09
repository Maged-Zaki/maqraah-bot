import { Client } from 'discord.js';
import * as cron from 'node-cron';
import { getConfig, getAllNotes, deleteNotes } from './database';
import { getNextPage } from './utils';

let scheduledJob: cron.ScheduledTask | null = null;

export function scheduleReminder(client: Client) {
	getConfig().then((config) => {
		if (!config.roleId || !process.env.CHANNEL_ID) {
			console.log('Role or channel not set, skipping reminder setup.');
			return;
		}

		if (scheduledJob) {
			scheduledJob.stop();
			scheduledJob = null;
		}

		const cronTime = parseTimeToCron(config.dailyTime, config.timezone);
		if (!cronTime) {
			console.log('Invalid time format, skipping reminder.');
			return;
		}

		scheduledJob = cron.schedule(
			cronTime,
			async () => {
				const channel = client.channels.cache.get(process.env.CHANNEL_ID!);
				if (channel && channel.isTextBased()) {
					const nextPage = getNextPage(config.lastPage);
					let message = `<@&${config.roleId}>\nPage: [${nextPage}](https://quran.com/page/${nextPage})\nHadith: ${config.lastHadith + 1}`;

					const notes = await getAllNotes();
					if (notes.length > 0) {
						const noteIds = notes.map((n) => n.id);
						await deleteNotes(noteIds);
						message += '\n\nNotes:';
						for (const note of notes) {
							message += `\n<@${note.userId}>: ${note.note}`;
						}
					}

					await (channel as any).send(message);
				}
			},
			{
				timezone: config.timezone,
			}
		);
	});
}

function parseTimeToCron(time: string, timezone: string): string | null {
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
