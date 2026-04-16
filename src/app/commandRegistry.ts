import { Client } from 'discord.js';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../observability/logging/logger';

interface BotCommand {
	data: {
		name: string;
	};
	execute: (interaction: any) => Promise<void>;
}

export async function registerCommands(client: Client): Promise<void> {
	logger.info('Starting command registration', undefined, { operationType: 'command_registration' });

	const commands = discoverCommandModules();

	for (const command of commands) {
		(client as any).commands.set(command.data.name, command);
	}

	const guildId = process.env.GUILD_ID;
	if (!guildId) {
		return;
	}

	const guild = client.guilds.cache.get(guildId);
	if (!guild) {
		logger.warn(`Guild with ID ${guildId} not found in cache`);
		return;
	}

	await guild.commands.set((client as any).commands.map((cmd: BotCommand) => cmd.data));
	logger.info(`Commands registered to guild: ${guild.name}`, undefined, {
		additionalData: { guildId, commandCount: (client as any).commands.size },
	});
}

function discoverCommandModules(): BotCommand[] {
	const featuresPath = path.join(__dirname, '..', 'features');
	const commandFiles = findCommandFiles(featuresPath);
	const commands: BotCommand[] = [];

	for (const filePath of commandFiles) {
		const command = require(filePath);
		if (isBotCommand(command)) {
			commands.push(command);
		} else {
			logger.warn(`Command file ${filePath} is missing required 'data' or 'execute' properties`);
		}
	}

	return commands;
}

function findCommandFiles(directoryPath: string): string[] {
	if (!fs.existsSync(directoryPath)) {
		return [];
	}

	const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
	const files: string[] = [];

	for (const entry of entries) {
		const entryPath = path.join(directoryPath, entry.name);

		if (entry.isDirectory()) {
			files.push(...findCommandFiles(entryPath));
		} else if (entry.isFile() && isCommandFile(entry.name)) {
			files.push(entryPath);
		}
	}

	return files;
}

function isCommandFile(fileName: string): boolean {
	return fileName === 'command.js' || fileName.endsWith('Command.js');
}

function isBotCommand(command: any): command is BotCommand {
	return command && 'data' in command && 'execute' in command;
}
