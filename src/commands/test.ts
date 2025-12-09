import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getConfig, getAllNotes, deleteNotes } from '../database';
import { getNextPage } from '../utils';

export const data = new SlashCommandBuilder().setName('test').setDescription('Send a test reminder message with current configuration');

export async function execute(interaction: any) {
	const config = await getConfig();
	if (!config.roleId || !process.env.CHANNEL_ID) {
		await interaction.reply({
			content: 'Configuration incomplete. Please set role and ensure channel is configured.',
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	const nextPage = getNextPage(config.lastPage);
	let message = `<@&${config.roleId}>\nPage: [${nextPage}](https://quran.com/page/${nextPage})\nHadith: ${config.lastHadith + 1}`;

	const notes = await getAllNotes();
	if (notes.length > 0) {
		message += '\n\nNotes:';
		for (const note of notes) {
			message += `\n<@${note.userId}>: ${note.note}`;
		}
	}

	if (interaction.channel && interaction.channel.isTextBased()) {
		await interaction.channel.send(message);
		await interaction.reply({ content: 'Test reminder sent!', flags: MessageFlags.Ephemeral });
	} else {
		await interaction.reply({ content: 'Cannot send message in this channel.', flags: MessageFlags.Ephemeral });
	}
}
