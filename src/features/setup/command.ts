import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { DiscordContext, logger } from '../../observability/logging/logger';
import { resolveSetupGuideCommandReferences } from './commandReferences';
import { buildSetupGuideMessage } from './messages';

const subcommands = {
	GUIDE: 'guide',
} as const;

export const data = new SlashCommandBuilder()
	.setName('setup')
	.setDescription('Setup guidance for the Maqraah bot')
	.addSubcommand((subcommand) => subcommand.setName(subcommands.GUIDE).setDescription('Post setup instructions'));

export async function execute(interaction: any): Promise<void> {
	const subcommand = interaction.options.getSubcommand();
	const discordContext: DiscordContext = {
		userId: interaction.user.id,
		username: interaction.user.username,
		guildId: interaction.guildId?.toString(),
		channelId: interaction.channelId?.toString(),
		commandName: 'setup',
		subcommand,
	};

	logger.info(`Executing setup subcommand: ${subcommand}`, discordContext, { operationType: 'setup_command' });

	try {
		switch (subcommand) {
			case subcommands.GUIDE:
				await interaction.reply({
					content: buildSetupGuideMessage(resolveSetupGuideCommandReferences(interaction.guild)),
				});
				logger.info('Setup guide sent on demand', discordContext, {
					operationType: 'setup_guide',
					operationStatus: 'success',
				});
				break;
		}
	} catch (error) {
		logger.error(`Error executing setup subcommand: ${subcommand}`, error as Error, discordContext, {
			operationType: 'setup_command',
			operationStatus: 'failure',
		});
		await interaction.reply({ content: 'There was an error executing this command!', flags: MessageFlags.Ephemeral });
	}
}
