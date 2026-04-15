import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { parseTimeToCron } from './cadence';
import { overrideNextReminder } from './scheduler';

const options = {
	TIME: 'time',
} as const;

export const data = new SlashCommandBuilder()
	.setName('change-upcoming-maqraah-time')
	.setDescription('Change the time for the next maqraah reminder')
	.addStringOption((option) => option.setName(options.TIME).setDescription('New time for the reminder (HH:MM AM/PM)').setRequired(true));

export async function execute(interaction: any) {
	const time = interaction.options.getString(options.TIME);

	const cronTime = parseTimeToCron(time);
	if (!cronTime) {
		await interaction.reply({
			content: 'Invalid time format. Please use HH:MM AM/PM format, e.g., "12:00 AM".',
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	await overrideNextReminder(interaction.client, time);
	await interaction.reply({ content: `Next maqraah reminder changed to \`${time}\`.`, flags: MessageFlags.Ephemeral });
}
