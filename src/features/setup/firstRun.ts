import { Client, PermissionsBitField } from 'discord.js';
import { DiscordContext, logger } from '../../observability/logging/logger';
import { resolveSetupGuideCommandReferences } from './commandReferences';
import { buildSetupGuideMessage } from './messages';

export type SetupConfiguration = {
	welcomeSentAt?: string | null;
};

export type SetupConfigurationRepository = {
	getConfiguration(): Promise<SetupConfiguration>;
	updateConfiguration(updates: { welcomeSentAt: string }): Promise<void>;
};

export type FirstRunSetupGuideResult =
	| { sent: true; welcomeSentAt: string }
	| { sent: false; reason: 'already_sent' | 'missing_channel_id' | 'channel_not_found' | 'missing_permissions' };

type SendableSetupGuideChannel = {
	id: string;
	guild?: Parameters<typeof resolveSetupGuideCommandReferences>[0];
	permissionsFor(user: NonNullable<Client['user']>): { has(permission: bigint): boolean } | null;
	send(content: string): Promise<unknown>;
};

export async function sendFirstRunSetupGuide(client: Client, repository: SetupConfigurationRepository): Promise<FirstRunSetupGuideResult> {
	const configuration = await repository.getConfiguration();
	if (configuration.welcomeSentAt) {
		logger.info('First-run setup guide already sent, skipping startup guide', undefined, {
			operationType: 'setup_guide',
			operationStatus: 'success',
			additionalData: { welcomeSentAt: configuration.welcomeSentAt },
		});
		return { sent: false, reason: 'already_sent' };
	}

	const sendResult = await sendSetupGuideToConfiguredChannel(client);
	if (!sendResult.sent) {
		return sendResult;
	}

	const welcomeSentAt = new Date().toISOString();
	await repository.updateConfiguration({ welcomeSentAt });
	logger.info('First-run setup guide sent and marked complete', undefined, {
		operationType: 'setup_guide',
		operationStatus: 'success',
		additionalData: { channelId: sendResult.channelId, welcomeSentAt },
	});

	return { sent: true, welcomeSentAt };
}

async function sendSetupGuideToConfiguredChannel(
	client: Client
): Promise<{ sent: true; channelId: string } | { sent: false; reason: 'missing_channel_id' | 'channel_not_found' | 'missing_permissions' }> {
	const channelId = process.env.CHANNEL_ID;

	if (!channelId) {
		logger.error('CHANNEL_ID is not set in environment variables', undefined, undefined, {
			operationType: 'setup_guide',
			operationStatus: 'failure',
		});
		return { sent: false, reason: 'missing_channel_id' };
	}

	const channel = client.channels.cache.get(channelId);
	if (!isSendableSetupGuideChannel(channel)) {
		logger.warn(`Channel ${channelId} not found in cache, skipping first-run setup guide`, undefined, {
			operationType: 'setup_guide',
			operationStatus: 'failure',
			additionalData: { channelId },
		});
		return { sent: false, reason: 'channel_not_found' };
	}

	const discordContext: DiscordContext = {
		guildId: channel.guild?.id,
		channelId,
	};
	const permissions = client.user ? channel.permissionsFor(client.user) : null;
	if (!permissions || !permissions.has(PermissionsBitField.Flags.ViewChannel) || !permissions.has(PermissionsBitField.Flags.SendMessages)) {
		logger.error(`Missing permissions to send setup guide in channel ${channelId}`, undefined, discordContext, {
			operationType: 'setup_guide',
			operationStatus: 'failure',
			additionalData: { channelId },
		});
		return { sent: false, reason: 'missing_permissions' };
	}

	await channel.send(buildSetupGuideMessage(resolveSetupGuideCommandReferences(channel.guild)));
	logger.info('Setup guide sent successfully', discordContext, {
		operationType: 'setup_guide',
		operationStatus: 'success',
		additionalData: { channelId },
	});

	return { sent: true, channelId };
}

function isSendableSetupGuideChannel(channel: unknown): channel is SendableSetupGuideChannel {
	if (!channel || typeof channel !== 'object') {
		return false;
	}

	const candidate = channel as Partial<SendableSetupGuideChannel>;
	return typeof candidate.id === 'string' && typeof candidate.send === 'function' && typeof candidate.permissionsFor === 'function';
}
