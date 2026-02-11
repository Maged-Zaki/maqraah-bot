import 'dotenv/config';
import { Client, GatewayIntentBits, Collection, Events, TextChannel, PermissionsBitField, MessageFlags } from 'discord.js';
import * as fs from 'fs';
import * as path from 'path';
import { configurationRepository } from './database';
import { scheduleReminder } from './scheduler';
import { logger, DiscordContext } from './logger';

const requiredEnvVars = ['DISCORD_TOKEN', 'GUILD_ID', 'CHANNEL_ID'];
for (const varName of requiredEnvVars) {
	if (!process.env[varName]) {
		logger.fatal(`Required environment variable ${varName} is not set. Please check your .env file.`);
		throw new Error(`Required environment variable ${varName} is not set. Please check your .env file.`);
	}
}

logger.info('Starting Maqraah Bot initialization', undefined, { operationType: 'startup' });

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

(client as any).commands = new Collection();

async function registerCommands(client: Client) {
	logger.info('Starting command registration', undefined, { operationType: 'command_registration' });

	const commandsPath = path.join(__dirname, 'commands');
	const commandFiles = fs.readdirSync(commandsPath).filter((file: string) => file.endsWith('.js'));

	logger.debug(`Found ${commandFiles.length} command files`, undefined, { additionalData: { commandFiles } });

	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);
		if ('data' in command && 'execute' in command) {
			(client as any).commands.set(command.data.name, command);
			logger.debug(`Registered command: ${command.data.name}`);
		} else {
			logger.warn(`Command file ${file} is missing required 'data' or 'execute' properties`);
		}
	}

	const guildId = process.env.GUILD_ID;
	if (guildId) {
		const guild = client.guilds.cache.get(guildId);
		if (guild) {
			await guild.commands.set((client as any).commands.map((cmd: any) => cmd.data));
			logger.info(`Commands registered to guild: ${guild.name}`, undefined, {
				additionalData: { guildId, commandCount: (client as any).commands.size },
			});
		} else {
			logger.warn(`Guild with ID ${guildId} not found in cache`);
		}
	}
}

client.once('clientReady', async () => {
	logger.info(`Bot logged in successfully`, undefined, { additionalData: { botTag: client.user?.tag } });
	console.log(`Logged in as ${client.user?.tag}!`);

	await registerCommands(client);

	// Schedule daily reminder
	scheduleReminder(client);

	const channelId = process.env.CHANNEL_ID;

	if (!channelId) {
		logger.error('CHANNEL_ID is not set in environment variables');
		console.error('CHANNEL_ID is not set in environment variables.');
		return;
	}

	const channel = client.channels.cache.get(channelId);
	if (channel instanceof TextChannel) {
		const permissions = channel.permissionsFor(client.user!);
		if (permissions && permissions.has(PermissionsBitField.Flags.ViewChannel) && permissions.has(PermissionsBitField.Flags.SendMessages)) {
			await channel.send(`
Hello! I am the Maqraah bot. I am here to help you track your daily Qur'an and Hadith reading.

To get started, please use the \`/configuration update\` command to set up your preferences. You can configure multiple settings at once.

Once you have configured me, I will send you a daily reminder to read your Qur'an and Hadith.

For more information, use \`/help\` to see all available commands.
			`);
			logger.info('Welcome message sent successfully', undefined, { additionalData: { channelId } });
		} else {
			logger.error(`Missing permissions to send messages in channel ${channelId}`);
			console.error(`Missing permissions to send messages in channel ${channelId}`);
		}
	} else {
		logger.warn(`Channel ${channelId} not found in cache, skipping welcome message`);
		console.log(`Channel ${channelId} not found in cache, skipping welcome message.`);
	}
});

client.on('interactionCreate', async (interaction) => {
	if (!interaction.isChatInputCommand()) return;

	const command = (client as any).commands.get(interaction.commandName);
	if (!command) {
		logger.warn(`Unknown command received: ${interaction.commandName}`, {
			userId: interaction.user.id,
			guildId: interaction.guildId?.toString(),
			channelId: interaction.channelId?.toString(),
			commandName: interaction.commandName,
		});
		return;
	}

	const discordContext: DiscordContext = {
		userId: interaction.user.id,
		username: interaction.user.username,
		guildId: interaction.guildId?.toString(),
		channelId: interaction.channelId?.toString(),
		commandName: interaction.commandName,
	};

	const startTime = Date.now();

	try {
		logger.info(`Executing command: ${interaction.commandName}`, discordContext, { operationType: 'command_execution' });
		await command.execute(interaction);
		const duration = Date.now() - startTime;
		logger.recordCommandEvent(interaction.commandName, undefined, discordContext, duration, true);
		logger.debug(`Command ${interaction.commandName} executed successfully in ${duration}ms`, discordContext, {
			operationType: 'command_execution',
			operationStatus: 'success',
			duration,
		});
	} catch (error) {
		const duration = Date.now() - startTime;
		logger.error(`Error executing command: ${interaction.commandName}`, error as Error, discordContext, {
			operationType: 'command_execution',
			operationStatus: 'failure',
			duration,
		});
		logger.recordCommandEvent(interaction.commandName, undefined, discordContext, duration, false);
		console.error(error);
		await interaction.reply({ content: 'There was an error executing this command!', flags: MessageFlags.Ephemeral });
	}
});

client.on(Events.GuildCreate, async (guild) => {
	logger.info(`Bot joined new guild`, undefined, { additionalData: { guildId: guild.id, guildName: guild.name } });
	try {
		await configurationRepository.updateConfiguration({ roleId: guild.roles.everyone.id });
		logger.info(`Configuration updated for new guild`, undefined, {
			additionalData: { guildId: guild.id, guildName: guild.name, roleId: guild.roles.everyone.id },
		});
		console.log(`Joined guild ${guild.name}, set role to @everyone`);
	} catch (error) {
		logger.error(`Failed to update configuration for new guild: ${guild.name}`, error as Error, undefined, {
			additionalData: { guildId: guild.id, guildName: guild.name },
		});
	}
});

// Handle process shutdown gracefully
process.on('SIGINT', () => {
	logger.info('Received SIGINT, shutting down gracefully');
	client.destroy();
	process.exit(0);
});

process.on('SIGTERM', () => {
	logger.info('Received SIGTERM, shutting down gracefully');
	client.destroy();
	process.exit(0);
});

process.on('uncaughtException', (error) => {
	logger.fatal('Uncaught exception', error);
	process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
	logger.fatal('Unhandled rejection', reason instanceof Error ? reason : new Error(String(reason)));
});

client.login(process.env.DISCORD_TOKEN);
