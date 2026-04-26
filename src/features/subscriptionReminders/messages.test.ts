import assert from 'node:assert/strict';
import test from 'node:test';
import type { HijriCalendarCacheEntry } from '../../storage/sqlite/repositories/HijriCalendarCacheRepository';

process.env.DATABASE_PATH ??= ':memory:';

const { subscriptionReminderEvents } = require('./catalog') as typeof import('./catalog');
const { buildSubscriptionReminderMessage } = require('./messages') as typeof import('./messages');

test('subscription reminder messages are simple and include hadith and source', () => {
	const event = subscriptionReminderEvents.find((candidate) => candidate.key === 'fasting-monday');
	assert.ok(event);

	const message = buildSubscriptionReminderMessage({
		roleId: 'role-fasting',
		event,
		targetGregorianDate: '2026-04-20',
		hijriDate: null,
	});

	assert.match(message, /^<@&role-fasting>/);
	assert.match(message, /غدا صيام يوم الاثنين/);
	assert.match(message, /الحديث: تعرض الأعمال يوم الاثنين والخميس/);
	assert.match(message, /المصدر: جامع الترمذي 747: https:\/\/sunnah.com\/tirmidhi\/8\/66/);
	assert.doesNotMatch(message, /الموعد/);
});

test('six Shawwal reminder tells people to start from tomorrow before Shawwal ends', () => {
	const event = subscriptionReminderEvents.find((candidate) => candidate.key === 'six-shawwal');
	assert.ok(event);

	const message = buildSubscriptionReminderMessage({
		roleId: 'role-fasting',
		event,
		targetGregorianDate: '2026-04-21',
		hijriDate: buildHijriDate(),
	});

	assert.match(message, /من غد يبدأ صيام الست من شوال/);
	assert.match(message, /قبل نهاية شوال/);
	assert.match(message, /الحديث: من صام رمضان ثم أتبعه ستا من شوال/);
	assert.match(message, /المصدر: صحيح مسلم 1164a: https:\/\/sunnah.com\/muslim:1164a/);
	assert.doesNotMatch(message, /الموعد/);
});

function buildHijriDate(overrides: Partial<HijriCalendarCacheEntry> = {}): HijriCalendarCacheEntry {
	return {
		gregorianDate: '2026-04-21',
		hijriYear: 1447,
		hijriMonth: 10,
		hijriDay: 2,
		hijriMonthNameAr: 'شوال',
		hijriMonthNameEn: 'Shawwal',
		provider: 'fake',
		fetchedAt: '2026-04-20T12:00:00.000Z',
		...overrides,
	};
}
