import assert from 'node:assert/strict';
import test from 'node:test';
import { Configuration } from '../../../storage/sqlite/repositories/ConfigurationRepository';
import { buildReminderMessages } from './messages';

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
