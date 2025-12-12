import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { configurationRepository, progressRepository, notesRepository } from '../database';
import { buildReminderMessage } from '../utils';
const subcommands = {
	IGNORE_MENTION: 'ignore-mention',
	MENTION_EVERYONE: 'mention-everyone',
} as const;

export const data = new SlashCommandBuilder()
	.setName('test')
	.setDescription('Test reminder commands')
	.addSubcommand((subcommand) => subcommand.setName(subcommands.IGNORE_MENTION).setDescription('Send test reminder without mentioning anyone'))
	.addSubcommand((subcommand) => subcommand.setName(subcommands.MENTION_EVERYONE).setDescription('Send test reminder with role mention'));

export async function execute(interaction: any) {
	const subcommand = interaction.options.getSubcommand();
	let mentionRole: boolean;

	switch (subcommand) {
		case subcommands.MENTION_EVERYONE:
			mentionRole = true;
			break;
		case subcommands.IGNORE_MENTION:
			mentionRole = false;
			break;
		default:
			await interaction.reply({ content: 'Unknown subcommand.', flags: MessageFlags.Ephemeral });
			return;
	}

	const [config, progress, notes] = await Promise.all([
		configurationRepository.getConfiguration(),
		progressRepository.getProgress(),
		notesRepository.getAllNotes(),
	]);

	const message = buildReminderMessage(config, progress, notes, mentionRole);

	await interaction.channel.send(message);
	await interaction.reply({ content: 'Test reminder sent!', flags: MessageFlags.Ephemeral });
}
