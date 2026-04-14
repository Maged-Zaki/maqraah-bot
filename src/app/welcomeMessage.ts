import { Client, PermissionsBitField, TextChannel } from 'discord.js';
import { logger } from '../infrastructure/logging/logger';

export async function sendWelcomeMessage(client: Client): Promise<void> {
	const channelId = process.env.CHANNEL_ID;

	if (!channelId) {
		logger.error('CHANNEL_ID is not set in environment variables');
		return;
	}

	const channel = client.channels.cache.get(channelId);
	if (!(channel instanceof TextChannel)) {
		logger.warn(`Channel ${channelId} not found in cache, skipping welcome message`);
		return;
	}

	const permissions = channel.permissionsFor(client.user!);
	if (!permissions || !permissions.has(PermissionsBitField.Flags.ViewChannel) || !permissions.has(PermissionsBitField.Flags.SendMessages)) {
		logger.error(`Missing permissions to send messages in channel ${channelId}`);
		return;
	}

	await channel.send(`
Hello! I am the Maqraah bot. I am here to help you track your daily Qur'an and Hadith reading.

To get started, please use the \`/configuration update\` command to set up your preferences. You can configure multiple settings at once.

Once you have configured me, I will send you a daily reminder to read your Qur'an and Hadith.

For more information, use \`/help\` to see all available commands.
			`);
	logger.info('Welcome message sent successfully', undefined, { additionalData: { channelId } });
}
