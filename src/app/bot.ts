import { Client, Collection, Events, GatewayIntentBits } from 'discord.js';
import { scheduleMaqraahTimeSync } from '../features/maqraah/reminders/maqraahTimeSync';
import { scheduleReminder } from '../features/maqraah/reminders/scheduler';
import { scheduleGenericSchedules } from '../features/schedule/scheduler';
import { sendFirstRunSetupGuideFromConfig } from '../features/setup/startup';
import { configurationRepository } from '../storage/sqlite';
import { logger } from '../observability/logging/logger';
import { registerCommands } from './commandRegistry';
import { routeInteraction } from './interactionRouter';

const requiredEnvVars = ['DISCORD_TOKEN', 'GUILD_ID', 'CHANNEL_ID'];

export function startBot(): void {
	validateEnvironment();
	logger.info('Starting Maqraah Bot initialization', undefined, { operationType: 'startup' });

	const client = new Client({ intents: [GatewayIntentBits.Guilds] });
	(client as any).commands = new Collection();

	registerLifecycleHandlers(client);
	registerProcessHandlers(client);

	client.login(process.env.DISCORD_TOKEN);
}

function validateEnvironment(): void {
	for (const varName of requiredEnvVars) {
		if (!process.env[varName]) {
			logger.fatal(`Required environment variable ${varName} is not set. Please check your .env file.`);
			throw new Error(`Required environment variable ${varName} is not set. Please check your .env file.`);
		}
	}
}

function registerLifecycleHandlers(client: Client): void {
	client.once('clientReady', async () => {
		logger.info(`Bot logged in successfully`, undefined, { additionalData: { botTag: client.user?.tag } });

		await registerCommands(client);
		await scheduleMaqraahTimeSync(client);
		await scheduleReminder(client);
		await scheduleGenericSchedules(client);
		await sendFirstRunSetupGuideFromConfig(client);
	});

	client.on('interactionCreate', routeInteraction);

	client.on(Events.GuildCreate, async (guild) => {
		logger.info(`Bot joined new guild`, undefined, { additionalData: { guildId: guild.id, guildName: guild.name } });
		try {
			await configurationRepository.updateConfiguration({ roleId: guild.roles.everyone.id });
			logger.info(`Configuration updated for new guild`, undefined, {
				additionalData: { guildId: guild.id, guildName: guild.name, roleId: guild.roles.everyone.id },
			});
		} catch (error) {
			logger.error(`Failed to update configuration for new guild: ${guild.name}`, error as Error, undefined, {
				additionalData: { guildId: guild.id, guildName: guild.name },
			});
		}
	});
}

function registerProcessHandlers(client: Client): void {
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

	process.on('unhandledRejection', (reason) => {
		logger.fatal('Unhandled rejection', reason instanceof Error ? reason : new Error(String(reason)));
	});
}
