import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { parseReminderTime } from '../../shared/time';
import { overrideNextReminder } from './scheduler';

const options = {
	TIME: 'time',
} as const;

export const data = new SlashCommandBuilder()
	.setName('change-upcoming-maqraah-time')
	.setDescription('Change the time for the next maqraah reminder')
	.addStringOption((option) => option.setName(options.TIME).setDescription('New time for the reminder (H:MM AM/PM)').setRequired(true));

export async function execute(interaction: any) {
	const time = interaction.options.getString(options.TIME);

	const parsedTime = parseReminderTime(time);
	if (!parsedTime) {
		await interaction.reply({
			content: 'Invalid time format. Please use H:MM AM/PM format, e.g., "12:00 AM".',
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	await overrideNextReminder(interaction.client, parsedTime.displayTime);
	await interaction.reply({ content: `Next maqraah reminder changed to \`${parsedTime.displayTime}\`.`, flags: MessageFlags.Ephemeral });
}
