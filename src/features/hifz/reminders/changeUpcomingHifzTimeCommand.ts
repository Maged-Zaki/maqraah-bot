import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { parseReminderTime } from '../../../shared/time';
import { overrideNextHifzReminder } from './scheduler';

const options = {
	TIME: 'time',
} as const;

export const data = new SlashCommandBuilder()
	.setName('change-upcoming-hifz-time')
	.setDescription('Change the time for the next hifz reminder')
	.addStringOption((option) => option.setName(options.TIME).setDescription('New time for the hifz reminder (H:MM AM/PM)').setRequired(true));

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

	await overrideNextHifzReminder(interaction.client, parsedTime.displayTime);
	await interaction.reply({ content: `Next hifz reminder changed to \`${parsedTime.displayTime}\`.`, flags: MessageFlags.Ephemeral });
}
