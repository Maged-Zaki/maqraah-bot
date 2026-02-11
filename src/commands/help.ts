import { SlashCommandBuilder } from 'discord.js';
import { logger, DiscordContext } from '../logger';

export const data = new SlashCommandBuilder().setName('help').setDescription('List all available commands');

export async function execute(interaction: any) {
	const discordContext: DiscordContext = {
		userId: interaction.user.id,
		username: interaction.user.username,
		guildId: interaction.guildId?.toString(),
		channelId: interaction.channelId?.toString(),
		commandName: 'help',
	};

	logger.info('Executing help command', discordContext, { operationType: 'help_command' });

	try {
		const commands = interaction.client.commands.map((cmd: any) => `\`${cmd.data.name}\`: ${cmd.data.description}`).join('\n');

		logger.debug(`Found ${interaction.client.commands.size} commands`, discordContext, {
			additionalData: { commandCount: interaction.client.commands.size },
		});

		logger.info('Help command executed successfully', discordContext, { operationType: 'help_command', operationStatus: 'success' });

		await interaction.reply({
			content: `Available commands:\n${commands}`,
			ephemeral: true,
		});
	} catch (error) {
		logger.error('Error executing help command', error as Error, discordContext, { operationType: 'help_command', operationStatus: 'failure' });
		await interaction.reply({ content: 'There was an error executing this command!', flags: 64 });
	}
}
