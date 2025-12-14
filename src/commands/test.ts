import { SlashCommandBuilder, MessageFlags, ChatInputCommandInteraction } from 'discord.js';
import { configurationRepository, progressRepository, notesRepository } from '../database';
import { buildReminderMessage } from '../utils';
const subcommands = {
	IGNORE_MENTION: 'ignore-mention',
	MENTION_EVERYONE: 'mention-everyone',
} as const;

export const data = new SlashCommandBuilder()
	.setName('test')
	.setDescription('Test reminder commands')
	.addSubcommand((subcommand) => subcommand.setName(subcommands.IGNORE_MENTION).setDescription('Send test reminder privately to you for testing'))
	.addSubcommand((subcommand) => subcommand.setName(subcommands.MENTION_EVERYONE).setDescription('Send test reminder publicy and mention everyone'));

export async function execute(interaction: ChatInputCommandInteraction) {
	if (!interaction.inGuild() || !interaction.channel) {
		await interaction.reply({
			content: 'This command can only be used in a server channel.',
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	const subcommand = interaction.options.getSubcommand();
	const mentionRole = subcommand === subcommands.MENTION_EVERYONE;

	const [config, progress, notes] = await Promise.all([
		configurationRepository.getConfiguration(),
		progressRepository.getProgress(),
		notesRepository.getAllNotes(),
	]);

	const message = buildReminderMessage(config, progress, notes);

	if (mentionRole) {
		await interaction.channel.send(message);
	} else {
		await interaction.reply({
			content: message,
			flags: MessageFlags.Ephemeral,
		});
	}
}
