import assert from 'node:assert/strict';
import test from 'node:test';
import type { Note } from '../../storage/sqlite/repositories/NotesRepository';
import { destructiveConfirmationStore, parseDestructiveConfirmationCustomId } from '../../shared/confirmations/destructiveConfirmation';
import { buildDeletionConfirmationMessage, requestNotesDeletionConfirmation } from './deleteConfirmations';

test('delete-all confirmation previews notes and waits for confirmation before deleting', async () => {
	destructiveConfirmationStore.clear();
	const interaction = createInteraction();
	const repository = createRepository();
	const notes = createNotes();

	await requestNotesDeletionConfirmation({
		interaction,
		notes,
		repository,
		discordContext: createDiscordContext(),
		scope: 'all',
	});

	assert.deepEqual(repository.deletedIds, []);
	assert.match(interaction.replyPayload.content, /all 2 note\(s\) for everyone/);
	assert.match(interaction.replyPayload.content, /Preview:/);
	assert.match(interaction.replyPayload.content, /First note/);

	const confirmationId = getConfirmationId(interaction.replyPayload);
	const result = await destructiveConfirmationStore.confirm(confirmationId, 'user-1');

	assert.equal(result.status, 'confirmed');
	assert.deepEqual(repository.deletedIds, [1, 2]);

	destructiveConfirmationStore.clear();
});

test('cancelled notes deletion leaves notes untouched', async () => {
	destructiveConfirmationStore.clear();
	const interaction = createInteraction();
	const repository = createRepository();

	await requestNotesDeletionConfirmation({
		interaction,
		notes: createNotes(),
		repository,
		discordContext: createDiscordContext(),
		scope: 'all',
	});

	const confirmationId = getConfirmationId(interaction.replyPayload);
	const result = await destructiveConfirmationStore.cancel(confirmationId, 'user-1');

	assert.equal(result.status, 'cancelled');
	assert.deepEqual(repository.deletedIds, []);

	destructiveConfirmationStore.clear();
});

test('different user cannot confirm notes deletion', async () => {
	destructiveConfirmationStore.clear();
	const interaction = createInteraction();
	const repository = createRepository();

	await requestNotesDeletionConfirmation({
		interaction,
		notes: createNotes(),
		repository,
		discordContext: createDiscordContext(),
		scope: 'all',
	});

	const confirmationId = getConfirmationId(interaction.replyPayload);
	const result = await destructiveConfirmationStore.confirm(confirmationId, 'user-2');

	assert.deepEqual(result, { status: 'unauthorized', ownerUserId: 'user-1' });
	assert.deepEqual(repository.deletedIds, []);

	destructiveConfirmationStore.clear();
});

test('selected note confirmation includes selected count and positions', () => {
	const notes = createNotes();
	const message = buildDeletionConfirmationMessage(
		'selected',
		notes,
		new Map([
			[1, 3],
			[2, 5],
		])
	);

	assert.match(message, /2 selected note\(s\)/);
	assert.match(message, /#3 <@user-1>: First note/);
	assert.match(message, /#5 Anonymous: Second note/);
});

function createInteraction(): any {
	return {
		user: { id: 'user-1', username: 'Requester' },
		guildId: 'guild-1',
		channelId: 'channel-1',
		replyPayload: undefined,
		async reply(payload: unknown) {
			this.replyPayload = payload;
		},
	};
}

function createRepository(): { deletedIds: number[]; deleteNotes(ids: number[]): Promise<void> } {
	return {
		deletedIds: [],
		async deleteNotes(ids: number[]) {
			this.deletedIds.push(...ids);
		},
	};
}

function createNotes(): Note[] {
	return [
		{ id: 1, userId: 'user-1', note: 'First note', dateAdded: '2026-04-15T12:00:00.000Z', status: 'pending' },
		{ id: 2, userId: 'user-2', note: 'Second note', dateAdded: '2026-04-15T13:00:00.000Z', status: 'pending', isAnonymous: 1 },
	];
}

function createDiscordContext() {
	return {
		userId: 'user-1',
		username: 'Requester',
		guildId: 'guild-1',
		channelId: 'channel-1',
		commandName: 'notes',
		subcommand: 'delete-all',
	};
}

function getConfirmationId(replyPayload: any): string {
	const row = replyPayload.components[0].toJSON();
	const customId = row.components[0].custom_id;
	const parsedCustomId = parseDestructiveConfirmationCustomId(customId);

	if (!parsedCustomId) {
		assert.fail(`Expected a destructive confirmation custom ID, got ${customId}`);
	}

	return parsedCustomId.confirmationId;
}
