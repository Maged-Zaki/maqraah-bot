import assert from 'node:assert/strict';
import test from 'node:test';
import type { Configuration } from '../../../storage/sqlite/repositories/ConfigurationRepository';
import type { Note } from '../../../storage/sqlite/repositories/NotesRepository';
import type { HifzProgress } from '../../../storage/sqlite/repositories/HifzProgressRepository';
import { buildHifzReminderMessages, buildPreHifzReminderMessage } from './messages';

test('hifz pre-reminder message mentions the role and countdown', () => {
	const message = buildPreHifzReminderMessage(buildConfiguration({ roleId: 'hifz-role', hifzPreReminderOffsetMinutes: 10 }));

	assert.equal(message, '<@&hifz-role> السلام عليكم ورحمة الله وبركاته\nحلقة الحفظ بعد 10 دقائق إن شاء الله.');
});

test('hifz main reminder message references the memorization page and links quran.com', () => {
	const { mainMessage } = buildHifzReminderMessages(buildConfiguration({ roleId: 'hifz-role' }), buildProgress({ currentPage: 42 }), []);

	assert.equal(mainMessage, `<@&hifz-role> بدأت حلقة الحفظ\n\nصفحة الحفظ النهارده: [42](https://quran.com/page/42)\n`);
});

test('hifz reminder carries pending notes in a numbered list', () => {
	const notes = [buildNote({ id: 1, note: 'راجع التجويد' }), buildNote({ id: 2, note: 'المراجعة بكرة' })];
	const { notesMessages } = buildHifzReminderMessages(buildConfiguration({}), buildProgress({ currentPage: 1 }), notes);

	assert.deepEqual(notesMessages, [`ملاحظات اليوم:\n1. راجع التجويد\n2. المراجعة بكرة\n`]);
});

test('hifz reminder omits notes block when there are no notes', () => {
	const { notesMessages } = buildHifzReminderMessages(buildConfiguration({}), buildProgress({ currentPage: 1 }), []);

	assert.deepEqual(notesMessages, []);
});

function buildProgress(progress: Partial<HifzProgress>): HifzProgress {
	return {
		currentPage: 1,
		...progress,
	};
}

function buildNote(note: Partial<Note>): Note {
	return {
		id: 1,
		userId: 'user-1',
		note: 'Note',
		dateAdded: '2026-04-15T10:00:00.000Z',
		status: 'pending',
		...note,
	};
}

function buildConfiguration(configuration: Partial<Configuration>): Configuration {
	return {
		roleId: 'role-id',
		dailyTime: '1:00 PM',
		timezone: 'Africa/Cairo',
		voiceChannelId: '',
		preReminderEnabled: 1,
		preReminderOffsetMinutes: 5,
		mainReminderEnabled: 1,
		maqraahTimeSyncEnabled: 0,
		maqraahTimeSyncOffsetMinutes: 30,
		maqraahTimeSyncLatitude: 30.0444,
		maqraahTimeSyncLongitude: 31.2357,
		maqraahTimeSyncCalculationMethod: 5,
		welcomeSentAt: null,
		...configuration,
	};
}
