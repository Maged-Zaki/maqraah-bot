import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { overrideNextReminder } from '../scheduler';
import { getConfig } from '../database';

const options = {
	TIME: 'time',
} as const;

export const data = new SlashCommandBuilder()
	.setName('change-upcoming-maqraah-time')
	.setDescription('Override the time of the upcoming scheduled reminder.')
	.addStringOption((option) => option.setName(options.TIME).setDescription('The time for the upcoming reminder (HH:MM AM/PM)').setRequired(true));

export async function execute(interaction: any) {
	const time = interaction.options.getString(options.TIME);

	if (time) {
		const timeRegex = /^\d{1,2}:\d{2} (AM|PM)$/i;
		if (!timeRegex.test(time)) {
			await interaction.reply({
				content: 'Invalid time format. Please use HH:MM AM/PM format, e.g., "12:00 AM".',
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		await overrideNextReminder(interaction.client, time);
		const config = await getConfig();
		await interaction.reply(`<@&${config.roleId}> 📢 The upcoming Maqraah time has been changed and set to \`${time}\`).
> Note: This change only affects the upcoming reminder. Future reminders will follow the regular schedule which is \`${config.dailyTime}\` .
			`);
	}
}
