import assert from 'node:assert/strict';
import test from 'node:test';
import {
	buildCurrentHifzPagePrompt,
	buildHifzNextQuranPageActionCustomId,
	buildHifzPreviousQuranPageActionCustomId,
	buildHifzReminderActionCustomId,
	hifzReminderActions,
	parseHifzReminderActionCustomId,
} from './components';

test('hifz attendance custom ids round-trip through the parser', () => {
	const customId = buildHifzReminderActionCustomId(hifzReminderActions.JOINING_SHORTLY, 'hifz-2026-04-15');

	assert.deepEqual(parseHifzReminderActionCustomId(customId), {
		action: hifzReminderActions.JOINING_SHORTLY,
		sessionId: 'hifz-2026-04-15',
	});
});

test('hifz page navigation custom ids carry the page number', () => {
	const customId = buildHifzNextQuranPageActionCustomId('hifz-2026-04-15', 42);

	assert.deepEqual(parseHifzReminderActionCustomId(customId), {
		action: hifzReminderActions.NEXT_QURAN_PAGE,
		sessionId: 'hifz-2026-04-15',
		page: 42,
	});
});

test('previous hifz page custom id parses with page', () => {
	const customId = buildHifzPreviousQuranPageActionCustomId('hifz-2026-04-15', 1);

	assert.deepEqual(parseHifzReminderActionCustomId(customId), {
		action: hifzReminderActions.PREVIOUS_QURAN_PAGE,
		sessionId: 'hifz-2026-04-15',
		page: 1,
	});
});

test('hifz parser rejects maqraah-prefixed custom ids', () => {
	assert.equal(parseHifzReminderActionCustomId('reminder:joining-shortly:2026-04-15'), null);
});

test('hifz parser rejects malformed custom ids', () => {
	assert.equal(parseHifzReminderActionCustomId('hifz-reminder:unknown:hifz-2026-04-15'), null);
	assert.equal(parseHifzReminderActionCustomId('hifz-reminder:next-quran-page:hifz-2026-04-15:notanumber'), null);
	assert.equal(parseHifzReminderActionCustomId('hifz-reminder:joining-shortly:hifz-2026-04-15:extra'), null);
});

test('hifz page prompt includes an embed and prev/next components', () => {
	const prompt = buildCurrentHifzPagePrompt('hifz-2026-04-15', 5);

	assert.equal(prompt.embeds.length, 1);
	assert.equal(prompt.components.length, 1);
	assert.equal(prompt.components[0].components.length, 2);
});
