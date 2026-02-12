import { SlashCommandBuilder, MessageFlags, ChatInputCommandInteraction } from 'discord.js';
import { configurationRepository, progressRepository, notesRepository } from '../database';
import { buildReminderMessages } from '../utils';
import { logger, DiscordContext } from '../logger';

const subcommands = {
	PREVIEW_REMINDER: 'preview-reminder',
	MENTION_EVERYONE: 'mention-everyone',
} as const;

export const data = new SlashCommandBuilder()
	.setName('test')
	.setDescription('Test reminder commands')
	.addSubcommand((subcommand) =>
		subcommand.setName(subcommands.PREVIEW_REMINDER).setDescription('Sends a test reminder privately to you (No one sees it)')
	)
	.addSubcommand((subcommand) => subcommand.setName(subcommands.MENTION_EVERYONE).setDescription('Send test reminder publicy and mention everyone'));

export async function execute(interaction: ChatInputCommandInteraction) {
	const discordContext: DiscordContext = {
		userId: interaction.user.id,
		username: interaction.user.username,
		guildId: interaction.guildId?.toString(),
		channelId: interaction.channelId?.toString(),
		commandName: 'test',
	};

	logger.info('Executing test command', discordContext, { operationType: 'test_command' });

	try {
		if (!interaction.inGuild() || !interaction.channel) {
			logger.warn('Test command used outside of guild channel', discordContext, { operationType: 'test_command', operationStatus: 'failure' });
			await interaction.reply({
				content: 'This command can only be used in a server channel.',
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const subcommand = interaction.options.getSubcommand();
		const mentionRole = subcommand === subcommands.MENTION_EVERYONE;

		logger.debug(`Test subcommand: ${subcommand}, mentionRole: ${mentionRole}`, discordContext);

		const [config, progress, notes] = await Promise.all([
			configurationRepository.getConfiguration(),
			progressRepository.getProgress(),
			notesRepository.getAllNotes(),
		]);

		logger.debug(`Retrieved test data: ${notes.length} notes`, discordContext, { additionalData: { noteCount: notes.length } });

		const messages = buildReminderMessages(config, progress, notes);

		if (mentionRole) {
			logger.info('Sending test reminder publicly with role mention', discordContext);
			for (const msg of messages) {
				await interaction.channel.send(msg);
			}
			await interaction.reply({
				content: 'Reminder sent!',
				flags: MessageFlags.Ephemeral,
			});
		} else {
			logger.info('Sending test reminder privately', discordContext);
			// Send as many ephemeral messages as needed
			for (let i = 0; i < messages.length; i++) {
				if (i === 0) {
					await interaction.reply({
						content: messages[i],
						flags: MessageFlags.Ephemeral,
					});
				} else {
					await interaction.followUp({
						content: messages[i],
						flags: MessageFlags.Ephemeral,
					});
				}
			}
		}

		logger.info('Test command executed successfully', discordContext, { operationType: 'test_command', operationStatus: 'success' });
	} catch (error) {
		logger.error('Error executing test command', error as Error, discordContext, { operationType: 'test_command', operationStatus: 'failure' });
		await interaction.reply({ content: 'There was an error executing this command!', flags: MessageFlags.Ephemeral });
	}
}
