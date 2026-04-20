import newrelic from 'newrelic';
import { Interaction, MessageFlags } from 'discord.js';
import { handleDestructiveConfirmationButtonInteraction } from '../shared/confirmations/interactions';
import { handleReminderButtonInteraction } from '../features/maqraah/reminders/interactions';
import { handleScheduleModalSubmit, handleScheduleSelectMenuInteraction } from '../features/schedule/interactions';
import { DiscordContext, logger } from '../observability/logging/logger';

export async function routeInteraction(interaction: Interaction): Promise<void> {
	if (interaction.isButton()) {
		const handled = (await handleDestructiveConfirmationButtonInteraction(interaction)) || (await handleReminderButtonInteraction(interaction));
		if (!handled) {
			logger.warn(`Unhandled button interaction: ${interaction.customId}`);
		}
		return;
	}

	if (interaction.isStringSelectMenu()) {
		const handled = await handleScheduleSelectMenuInteraction(interaction);
		if (!handled) {
			logger.warn(`Unhandled select menu interaction: ${interaction.customId}`);
		}
		return;
	}

	if (interaction.isModalSubmit()) {
		const handled = await handleScheduleModalSubmit(interaction);
		if (!handled) {
			logger.warn(`Unhandled modal interaction: ${interaction.customId}`);
		}
		return;
	}

	if (!interaction.isChatInputCommand()) {
		return;
	}

	const command = (interaction.client as any).commands.get(interaction.commandName);
	if (!command) {
		logger.warn(`Unknown command received: ${interaction.commandName}`, {
			userId: interaction.user.id,
			guildId: interaction.guildId?.toString(),
			channelId: interaction.channelId?.toString(),
			commandName: interaction.commandName,
		});
		return;
	}

	let subcommand: string | undefined;
	try {
		subcommand = interaction.options.getSubcommand();
	} catch {
		// No subcommand available.
	}

	const transactionName = subcommand ? `Command/${interaction.commandName}/${subcommand}` : `Command/${interaction.commandName}`;
	const discordContext: DiscordContext = {
		userId: interaction.user.id,
		username: interaction.user.username,
		guildId: interaction.guildId?.toString(),
		channelId: interaction.channelId?.toString(),
		commandName: interaction.commandName,
		subcommand,
	};
	const startTime = Date.now();

	newrelic.startWebTransaction(transactionName, async () => {
		const transaction = newrelic.getTransaction();

		addInteractionAttributes(interaction, subcommand);

		try {
			logger.info(`Executing command: ${interaction.commandName}`, discordContext, { operationType: 'command_execution' });
			await command.execute(interaction);
			const duration = Date.now() - startTime;

			newrelic.addCustomAttribute('command.success', true);
			newrelic.addCustomAttribute('command.duration', duration);
			logger.recordCommandEvent(interaction.commandName, subcommand, discordContext, duration, true);
		} catch (error) {
			const duration = Date.now() - startTime;

			newrelic.addCustomAttribute('command.success', false);
			newrelic.addCustomAttribute('command.duration', duration);
			newrelic.addCustomAttribute('error.message', (error as Error).message);
			newrelic.noticeError(error as Error);

			logger.error(`Error executing command: ${interaction.commandName}`, error as Error, discordContext, {
				operationType: 'command_execution',
				operationStatus: 'failure',
				duration,
			});
			logger.recordCommandEvent(interaction.commandName, subcommand, discordContext, duration, false);
			await interaction.reply({ content: 'There was an error executing this command!', flags: MessageFlags.Ephemeral });
		} finally {
			transaction.end();
		}
	});
}

function addInteractionAttributes(interaction: Interaction & { commandName?: string }, subcommand?: string): void {
	newrelic.addCustomAttribute('discord.userId', interaction.user.id);
	newrelic.addCustomAttribute('discord.username', interaction.user.username);

	if (interaction.guildId) {
		newrelic.addCustomAttribute('discord.guildId', interaction.guildId.toString());
	}

	if (interaction.channelId) {
		newrelic.addCustomAttribute('discord.channelId', interaction.channelId.toString());
	}

	if (interaction.commandName) {
		newrelic.addCustomAttribute('discord.commandName', interaction.commandName);
	}

	if (subcommand) {
		newrelic.addCustomAttribute('discord.subcommand', subcommand);
	}
}
