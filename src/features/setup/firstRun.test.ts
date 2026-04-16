import assert from 'node:assert/strict';
import test from 'node:test';
import { PermissionsBitField } from 'discord.js';
import { logger } from '../../observability/logging/logger';
import { execute as executeSetupCommand } from './command';
import { sendFirstRunSetupGuide, SetupConfigurationRepository } from './firstRun';

test('first startup sends setup guide once and records welcomeSentAt', async () => {
	const previousChannelId = process.env.CHANNEL_ID;
	process.env.CHANNEL_ID = 'setup-channel';
	const repository = createRepository(null);
	const channel = createChannel({ id: 'setup-channel', permissions: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
	const client = createClient(channel);

	try {
		const result = await sendFirstRunSetupGuide(client as any, repository);

		assert.equal(result.sent, true);
		assert.equal(channel.sentMessages.length, 1);
		assert.match(channel.sentMessages[0], /\/configuration update/);
		assert.match(channel.sentMessages[0], /\/progress update/);
		assert.match(channel.sentMessages[0], /\/help/);
		assert.match(repository.welcomeSentAt ?? '', /^\d{4}-\d{2}-\d{2}T/);
	} finally {
		restoreEnv('CHANNEL_ID', previousChannelId);
	}
});

test('restart does not resend setup guide after welcomeSentAt is set', async () => {
	const previousChannelId = process.env.CHANNEL_ID;
	process.env.CHANNEL_ID = 'setup-channel';
	const repository = createRepository('2026-04-16T12:00:00.000Z');
	const channel = createChannel({ id: 'setup-channel', permissions: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
	const client = createClient(channel);

	try {
		const result = await sendFirstRunSetupGuide(client as any, repository);

		assert.deepEqual(result, { sent: false, reason: 'already_sent' });
		assert.equal(channel.sentMessages.length, 0);
		assert.equal(repository.updateCount, 0);
	} finally {
		restoreEnv('CHANNEL_ID', previousChannelId);
	}
});

test('/setup guide sends setup instructions publicly on demand', async () => {
	let replyPayload: any;
	const interaction = {
		user: { id: 'user-1', username: 'Reader' },
		guildId: 'guild-1',
		channelId: 'channel-1',
		guild: createGuild(),
		options: { getSubcommand: () => 'guide' },
		reply: async (payload: any) => {
			replyPayload = payload;
		},
	};

	await executeSetupCommand(interaction);

	assert.equal(replyPayload.flags, undefined);
	assert.equal(replyPayload.ephemeral, undefined);
	assert.match(replyPayload.content, /\/configuration update/);
	assert.match(replyPayload.content, /\/progress update/);
	assert.match(replyPayload.content, /\/help/);
});

test('missing channel permission is logged and does not mark setup guide sent', async () => {
	const previousChannelId = process.env.CHANNEL_ID;
	process.env.CHANNEL_ID = 'setup-channel';
	const repository = createRepository(null);
	const channel = createChannel({ id: 'setup-channel', permissions: [PermissionsBitField.Flags.ViewChannel] });
	const client = createClient(channel);
	const messages: string[] = [];
	const originalError = logger.error;
	(logger as any).error = (message: string) => {
		messages.push(message);
	};

	try {
		const result = await sendFirstRunSetupGuide(client as any, repository);

		assert.deepEqual(result, { sent: false, reason: 'missing_permissions' });
		assert.equal(channel.sentMessages.length, 0);
		assert.equal(repository.updateCount, 0);
		assert.ok(messages.some((message) => message.includes('Missing permissions to send setup guide in channel setup-channel')));
	} finally {
		(logger as any).error = originalError;
		restoreEnv('CHANNEL_ID', previousChannelId);
	}
});

function createRepository(welcomeSentAt: string | null): SetupConfigurationRepository & { welcomeSentAt: string | null; updateCount: number } {
	return {
		welcomeSentAt,
		updateCount: 0,
		async getConfiguration() {
			return { welcomeSentAt: this.welcomeSentAt };
		},
		async updateConfiguration(updates: { welcomeSentAt: string }) {
			this.welcomeSentAt = updates.welcomeSentAt;
			this.updateCount += 1;
		},
	};
}

function createClient(channel: ReturnType<typeof createChannel>) {
	return {
		user: { id: 'bot-user' },
		channels: {
			cache: new Map([[channel.id, channel]]),
		},
	};
}

function createChannel(options: { id: string; permissions: bigint[] }) {
	const permissions = new PermissionsBitField(options.permissions);

	return {
		id: options.id,
		guild: createGuild(),
		sentMessages: [] as string[],
		permissionsFor: () => permissions,
		async send(content: string) {
			this.sentMessages.push(content);
		},
	};
}

function createGuild() {
	return {
		id: 'guild-1',
		commands: {
			cache: {
				find: () => undefined,
			},
		},
	};
}

function restoreEnv(name: string, value: string | undefined): void {
	if (value === undefined) {
		delete process.env[name];
	} else {
		process.env[name] = value;
	}
}
