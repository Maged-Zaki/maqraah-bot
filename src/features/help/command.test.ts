import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_PATH ??= ':memory:';

const { data, execute } = require('./command') as typeof import('./command');

test('help command has the expected name and description', () => {
	const command = data.toJSON() as any;
	assert.equal(command.name, 'help');
	assert.equal(typeof command.description, 'string');
	assert.ok(command.description.length > 0);
});

test('help command lists available commands', async () => {
	const replies: any[] = [];

	await execute({
		user: { id: 'user-1', username: 'User One' },
		guildId: 'guild-1',
		channelId: 'channel-1',
		client: {
			commands: {
				map: (fn: (cmd: any) => string) => {
					return [{ data: { name: 'help', description: 'List commands' } }, { data: { name: 'configuration', description: 'Manage config' } }].map(fn);
				},
				size: 2,
			},
		},
		reply: async (payload: any) => {
			replies.push(payload);
		},
	});

	assert.equal(replies.length, 1);
	assert.ok(replies[0].content.includes('help'));
	assert.ok(replies[0].content.includes('configuration'));
	assert.equal(replies[0].ephemeral, true);
});
