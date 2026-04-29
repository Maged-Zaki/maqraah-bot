import assert from 'node:assert/strict';
import test from 'node:test';
import {
	buildCurrentQuranPageActionRows,
	buildCurrentQuranPagePrompt,
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
	const prompt = buildCurrentQuranPagePrompt('2026-04-15', 13);
	const embed = prompt.embeds[0].toJSON() as any;

	assert.equal('content' in prompt, false);
	assert.equal(embed.title, 'Page 13');
	assert.equal(embed.url, 'https://quran.com/page/13');
	assert.equal(embed.image.url, 'https://raw.githubusercontent.com/QuranHub/quran-pages-images/main/easyquran.com/hafs-tajweed/13.jpg');
	assert.equal(embed.footer.text, 'Page 13');
	assert.equal(previousButton.label, 'Previous');
	assert.equal(previousButton.emoji.name, '⬅️');
	assert.deepEqual(parseReminderActionCustomId(previousButton.custom_id), {
		action: reminderActions.PREVIOUS_QURAN_PAGE,
		sessionId: '2026-04-15',
		page: 13,
	});
	assert.equal(nextButton.label, 'Next');
	assert.equal(nextButton.emoji.name, '➡️');
	assert.deepEqual(parseReminderActionCustomId(nextButton.custom_id), {
		action: reminderActions.NEXT_QURAN_PAGE,
		sessionId: '2026-04-15',
		page: 13,
	});
});
