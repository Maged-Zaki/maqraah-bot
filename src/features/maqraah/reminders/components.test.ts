import assert from 'node:assert/strict';
import test from 'node:test';
import {
	buildCurrentQuranPageActionRows,
	buildCurrentQuranPageMessage,
	buildNotesCarryOverActionRows,
	parseReminderActionCustomId,
	reminderActions,
} from './components';

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

test('current quran page button targets a page within a reminder session', () => {
	const rows = buildCurrentQuranPageActionRows('2026-04-15', 13);
	const row = rows[0].toJSON() as any;
	const previousButton = row.components[0];
	const nextButton = row.components[1];

	assert.equal(buildCurrentQuranPageMessage(13), 'Current page: [13](https://quran.com/page/13)');
	assert.equal(previousButton.label, 'Previous Page <');
	assert.equal(previousButton.emoji, undefined);
	assert.deepEqual(parseReminderActionCustomId(previousButton.custom_id), {
		action: reminderActions.PREVIOUS_QURAN_PAGE,
		sessionId: '2026-04-15',
		page: 13,
	});
	assert.equal(nextButton.label, 'Next Page >');
	assert.equal(nextButton.emoji, undefined);
	assert.deepEqual(parseReminderActionCustomId(nextButton.custom_id), {
		action: reminderActions.NEXT_QURAN_PAGE,
		sessionId: '2026-04-15',
		page: 13,
	});
});
