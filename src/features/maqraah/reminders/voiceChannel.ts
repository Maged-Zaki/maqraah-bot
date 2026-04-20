import { Client } from 'discord.js';
import { configurationRepository } from '../../../storage/sqlite';
import { logger } from '../../../observability/logging/logger';

export async function updateReminderVoiceChannelName(client: Client, dailyTime: string): Promise<void> {
	const configuration = await configurationRepository.getConfiguration();
	if (!configuration.voiceChannelId) {
		return;
	}

	const guild = client.guilds.cache.get(process.env.GUILD_ID!);
	const voiceChannel = guild?.channels.cache.get(configuration.voiceChannelId);
	if (!voiceChannel || !voiceChannel.isVoiceBased()) {
		return;
	}

	const permissions = voiceChannel.permissionsFor(client.user!);
	if (!permissions?.has('ManageChannels')) {
		logger.warn('Bot lacks ManageChannels permission for the voice channel');
		return;
	}

	try {
		const timeWithoutAmpm = dailyTime.replace(/\s*(AM|PM)$/i, '');
		await voiceChannel.setName(`مقراة الساعة ${timeWithoutAmpm}`);
		logger.info(`Updated voice channel name to ${timeWithoutAmpm}`);
	} catch (error) {
		logger.error('Failed to update voice channel name', error as Error);
	}
}
