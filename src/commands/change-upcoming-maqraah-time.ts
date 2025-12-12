import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { configurationRepository } from '../database';
import { scheduleReminder, overrideNextReminder } from '../scheduler';

const options = {
	TIME: 'time',
} as const;

export const data = new SlashCommandBuilder()
	.setName('change-upcoming-maqraah-time')
	.setDescription('Change the time for the next maqraah reminder')
	.addStringOption((option) => option.setName(options.TIME).setDescription('New time for the reminder (HH:MM AM/PM)').setRequired(true));

export async function execute(interaction: any) {
	const time = interaction.options.getString(options.TIME);

	const timeRegex = /^\d{1,2}:\d{2} (AM|PM)$/i;
	if (!timeRegex.test(time)) {
		await interaction.reply({
			content: 'Invalid time format. Please use HH:MM AM/PM format, e.g., "12:00 AM".',
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	const cronTime = parseTimeToCron(time);
	if (!cronTime) {
		await interaction.reply({ content: 'Invalid time format.', flags: MessageFlags.Ephemeral });
		return;
	}

	await overrideNextReminder(interaction.client, time);
	await interaction.reply({ content: `Next maqraah reminder changed to \`${time}\`.`, flags: MessageFlags.Ephemeral });
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
