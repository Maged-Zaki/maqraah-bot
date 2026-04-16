import assert from 'node:assert/strict';
import test from 'node:test';
import {
	InMemoryDestructiveConfirmationStore,
	buildDestructiveConfirmationCustomId,
	destructiveConfirmationActions,
	parseDestructiveConfirmationCustomId,
} from './destructiveConfirmation';

test('destructive confirmation does not run until confirmed', async () => {
	let deleted = false;
	const store = new InMemoryDestructiveConfirmationStore(() => 0, () => 'confirmation-1');

	const confirmation = store.create({
		userId: 'user-1',
		onConfirm: async () => {
			deleted = true;
			return 'Deleted.';
		},
	});

	assert.equal(deleted, false);

	const result = await store.confirm(confirmation.id, 'user-1');

	assert.equal(result.status, 'confirmed');
	assert.equal(result.content, 'Deleted.');
	assert.equal(deleted, true);
});

test('cancel leaves destructive action untouched', async () => {
	let deleted = false;
	const store = new InMemoryDestructiveConfirmationStore(() => 0, () => 'confirmation-1');

	const confirmation = store.create({
		userId: 'user-1',
		onConfirm: async () => {
			deleted = true;
		},
		cancelledContent: 'No notes were removed.',
	});

	const result = await store.cancel(confirmation.id, 'user-1');

	assert.equal(result.status, 'cancelled');
	assert.equal(result.content, 'No notes were removed.');
	assert.equal(deleted, false);
});

test('different user cannot confirm destructive action', async () => {
	let deleted = false;
	const store = new InMemoryDestructiveConfirmationStore(() => 0, () => 'confirmation-1');

	const confirmation = store.create({
		userId: 'user-1',
		onConfirm: async () => {
			deleted = true;
		},
	});

	const result = await store.confirm(confirmation.id, 'user-2');

	assert.deepEqual(result, { status: 'unauthorized', ownerUserId: 'user-1' });
	assert.equal(deleted, false);
	assert.equal(store.get(confirmation.id), confirmation);
});

test('expired confirmation fails safely', async () => {
	let now = 0;
	let deleted = false;
	const store = new InMemoryDestructiveConfirmationStore(() => now, () => 'confirmation-1');

	const confirmation = store.create({
		userId: 'user-1',
		timeoutMs: 10,
		onConfirm: async () => {
			deleted = true;
		},
		expiredContent: 'Expired.',
	});

	now = 11;
	const result = await store.confirm(confirmation.id, 'user-1');

	assert.deepEqual(result, { status: 'expired', content: 'Expired.' });
	assert.equal(deleted, false);
	assert.equal(store.get(confirmation.id), undefined);
});

test('destructive confirmation custom IDs round-trip', () => {
	const customId = buildDestructiveConfirmationCustomId(destructiveConfirmationActions.CONFIRM, 'confirmation-1');

	assert.deepEqual(parseDestructiveConfirmationCustomId(customId), {
		action: destructiveConfirmationActions.CONFIRM,
		confirmationId: 'confirmation-1',
	});
	assert.equal(parseDestructiveConfirmationCustomId('other:confirm:confirmation-1'), null);
});
