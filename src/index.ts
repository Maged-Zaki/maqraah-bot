import { Client, GatewayIntentBits, Collection, Events, TextChannel, PermissionsBitField, MessageFlags } from 'discord.js';
import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';
import { getConfig, updateConfig } from './database';
import { scheduleReminder } from './scheduler';

config();

const requiredEnvVars = ['DISCORD_TOKEN', 'GUILD_ID', 'CHANNEL_ID'];
for (const varName of requiredEnvVars) {
	if (!process.env[varName]) {
		throw new Error(`Required environment variable ${varName} is not set. Please check your .env file.`);
	}
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

(client as any).commands = new Collection();

async function registerCommands(client: Client) {
	const commandsPath = path.join(__dirname, 'commands');
	const commandFiles = fs.readdirSync(commandsPath).filter((file: string) => file.endsWith('.js'));

	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);
		if ('data' in command && 'execute' in command) {
			(client as any).commands.set(command.data.name, command);
		}
	}

	const guildId = process.env.GUILD_ID;
	if (guildId) {
		const guild = client.guilds.cache.get(guildId);
		if (guild) {
			await guild.commands.set((client as any).commands.map((cmd: any) => cmd.data));
			console.log('Commands registered to guild.');
		}
	}
}

async function ensureDefaultConfig(client: Client) {
	const guildId = process.env.GUILD_ID;
	if (guildId) {
		const guild = client.guilds.cache.get(guildId);
		if (guild) {
			const config = await getConfig();
			if (!config.roleId || !config.dailyTime || !config.timezone) {
				await updateConfig({
					roleId: guild.roles.everyone.id,
					dailyTime: '12:00 PM',
					timezone: 'Africa/Cairo',
				});
				console.log('Default configuration set.');
			}
		}
	}
}

client.once('clientReady', async () => {
	console.log(`Logged in as ${client.user?.tag}!`);

	await registerCommands(client);
	await ensureDefaultConfig(client);

	// Schedule daily reminder
	scheduleReminder(client);

	const channelId = process.env.CHANNEL_ID;
	if (channelId) {
		const channel = client.channels.cache.get(channelId);
		if (channel && channel instanceof TextChannel) {
			const permissions = channel.permissionsFor(client.user!);
			if (permissions && permissions.has(PermissionsBitField.Flags.ViewChannel) && permissions.has(PermissionsBitField.Flags.SendMessages)) {
				await channel.send(`
Hello! I am the Maqraah bot. I am here to help you track your daily Qur'an and Hadith reading.

To get started, please use the \`/configure\` command to set up your preferences. You can configure multiple settings at once.

Once you have configured me, I will send you a daily reminder to read your Qur'an and Hadith.
				`);
			} else {
				console.error(`Missing permissions to send messages in channel ${channelId}`);
			}
		} else {
			console.log(`Channel ${channelId} not found in cache, skipping welcome message.`);
		}
	}
});

client.on('interactionCreate', async (interaction) => {
	if (!interaction.isChatInputCommand()) return;

	const command = (client as any).commands.get(interaction.commandName);
	if (!command) return;

	try {
		await command.execute(interaction);
	} catch (error) {
		console.error(error);
		await interaction.reply({ content: 'There was an error executing this command!', flags: MessageFlags.Ephemeral });
	}
});

client.on(Events.GuildCreate, async (guild) => {
	await updateConfig({ roleId: guild.roles.everyone.id });
	console.log(`Joined guild ${guild.name}, set role to @everyone`);
});

client.login(process.env.DISCORD_TOKEN);
