import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNotesCarryOverActionRows, parseReminderActionCustomId, reminderActions } from './components';

test('notes carry-over button targets a reminder session', () => {
	const rows = buildNotesCarryOverActionRows('2026-04-15');
	const row = rows[0].toJSON() as any;
	const button = row.components[0];

	assert.equal(button.label, 'رحّل الملاحظات لمقراة بكرة');
	assert.deepEqual(parseReminderActionCustomId(button.custom_id), {
		action: reminderActions.CARRY_OVER_NOTES,
		sessionId: '2026-04-15',
	});
});
