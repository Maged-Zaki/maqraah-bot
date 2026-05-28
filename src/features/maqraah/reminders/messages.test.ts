import assert from 'node:assert/strict';
import test from 'node:test';
import { Configuration } from '../../../storage/sqlite/repositories/ConfigurationRepository';
import { Note } from '../../../storage/sqlite/repositories/NotesRepository';
import { buildPreReminderMessage, buildReminderMessages } from './messages';

test('main reminder starts with the role mention and keeps reading details', () => {
	const { mainMessage } = buildReminderMessages(
		buildConfiguration({
			roleId: 'daily-role',
		}),
		{
			currentPage: 13,
			currentHadith: 35,
		},
		[]
	);

	assert.equal(
		mainMessage,
		`<@&daily-role> بدأت المقرأة\n\n` + `نبدأ من الصفحة: [13](https://quran.com/page/13)\n` + `الحديث الحالي: **35**\n`
	);
	assert.equal(mainMessage.includes('السلام عليكم ورحمة الله وبركاته'), false);
	assert.equal(mainMessage.includes('وقت المقراة اليومية! 📖'), false);
});

test('buildPreReminderMessage includes role mention and offset', () => {
	const message = buildPreReminderMessage(buildConfiguration({ roleId: 'pre-role', preReminderOffsetMinutes: 10 }));
	assert.equal(message.startsWith('<@&pre-role>'), true);
	assert.ok(message.includes('10'));
	assert.ok(message.includes('السلام عليكم ورحمة الله وبركاته'));
});

test('buildPreReminderMessage uses default offset when not configured', () => {
	const message = buildPreReminderMessage(buildConfiguration({ roleId: 'pre-role', preReminderOffsetMinutes: null as any }));
	assert.ok(message.includes('5'));
});

test('buildReminderMessages returns empty notes messages when no notes', () => {
	const { notesMessages } = buildReminderMessages(buildConfiguration(), { currentPage: 1, currentHadith: 1 }, []);
	assert.deepEqual(notesMessages, []);
});

test('buildReminderMessages returns notes messages for single note', () => {
	const notes: Note[] = [{ id: 1, userId: 'user-1', note: 'Review tajweed', dateAdded: '2026-04-15T12:00:00.000Z' }];
	const { notesMessages } = buildReminderMessages(buildConfiguration(), { currentPage: 1, currentHadith: 1 }, notes);
	assert.equal(notesMessages.length, 1);
	assert.ok(notesMessages[0].includes('Review tajweed'));
	assert.ok(notesMessages[0].includes('ملاحظات اليوم'));
});

test('buildReminderMessages chunks notes when they exceed message limit', () => {
	const notes: Note[] = [];
	for (let i = 1; i <= 100; i++) {
		notes.push({ id: i, userId: `user-${i}`, note: `Note ${i}: ${'x'.repeat(30)}`, dateAdded: '2026-04-15T12:00:00.000Z' });
	}
	const { notesMessages } = buildReminderMessages(buildConfiguration(), { currentPage: 1, currentHadith: 1 }, notes);
	assert.ok(notesMessages.length > 1);
	for (const msg of notesMessages) {
		assert.ok(msg.length <= 2000, `message length ${msg.length} exceeds 2000`);
	}
});

function buildConfiguration(configuration: Partial<Configuration> = {}): Configuration {
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
