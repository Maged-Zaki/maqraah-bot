export const subscriptionReminderCategories = {
	'muhammed-way': {
		key: 'muhammed-way',
		roleName: 'تذكيرات صيام الأنبياء',
		label: 'Prophet\'s Fasting (e.g., Monday, Thursday, White Days)',
		description: 'Fasting reminders for Mondays, Thursdays, and 13th-15th of Hijri months',
	},
	'dawwd-alternate': {
		key: 'dawwd-alternate',
		roleName: 'تذكيرات صيام الداوود',
		label: 'Dawood\'s Fasting (e.g., alternate day)',
		description: 'Fasting every other day (Dawood ibn Tamim\'s method)',
	},
	'special-occasions': {
		key: 'special-occasions',
		roleName: 'تذكيرات الصيام المناسبات',
		label: 'Occasional Fasting (e.g., Ashura, Arafah)',
		description: 'Fasting on special days: Ashura, Arafah, Tasua, Six Shawwal',
	},
	'islamic-events': {
		key: 'islamic-events',
		roleName: 'تذكيرات المناسبات الإسلامية',
		label: 'Islamic events (e.g., Ramadan, Eid)',
		description: 'Islamic calendar event reminders: Ramadan start, Eid al-Fitr, Eid al-Adha, etc.',
	},
} as const;

export type SubscriptionReminderCategoryKey = keyof typeof subscriptionReminderCategories;

export const subscriptionReminderCategoryKeys = Object.keys(subscriptionReminderCategories) as SubscriptionReminderCategoryKey[];

export type ReminderMatcher =
	| {
			type: 'gregorian-weekday';
			weekday: number;
	  }
	| {
			type: 'hijri-date';
			month: number;
			days: number[];
	  }
	| {
			type: 'alternate-day-cycle';
	  };

export interface ReminderSourceReference {
	label: string;
	url: string;
}

export interface ReminderHadithReference {
	text: string;
	source: ReminderSourceReference;
}

export interface ExcludedHijriDateRange {
	month: number;
	days: number[];
}

export interface SubscriptionReminderEventDefinition {
	key: string;
	categoryKey: SubscriptionReminderCategoryKey;
	leadDays: number;
	matcher: ReminderMatcher;
	messageKey:
		| 'fasting-monday'
		| 'fasting-thursday'
		| 'white-days'
		| 'six-shawwal'
		| 'arafah'
		| 'tasua'
		| 'ashura'
		| 'ramadan-start'
		| 'eid-fitr'
		| 'dhul-hijjah-ten'
		| 'eid-adha'
		| 'dawwd-alternate';
	hadith: ReminderHadithReference;
	excludedHijriDates?: ExcludedHijriDateRange[];
}

export const subscriptionReminderEvents: SubscriptionReminderEventDefinition[] = [
	{
		key: 'fasting-monday',
		categoryKey: 'muhammed-way',
		leadDays: 1,
		matcher: { type: 'gregorian-weekday', weekday: 1 },
		messageKey: 'fasting-monday',
		hadith: {
			text: 'تعرض الأعمال يوم الاثنين والخميس، فأحب أن يعرض عملي وأنا صائم.',
			source: { label: 'جامع الترمذي 747', url: 'https://sunnah.com/tirmidhi/8/66' },
		},
		excludedHijriDates: [
			{ month: 10, days: [1] }, // Eid al-Fitr (1 Shawwal)
			{ month: 12, days: [10, 11, 12, 13] }, // Eid al-Adha + Days of Tashriq (10-13 Dhul-Hijjah)
		],
	},
	{
		key: 'fasting-thursday',
		categoryKey: 'muhammed-way',
		leadDays: 1,
		matcher: { type: 'gregorian-weekday', weekday: 4 },
		messageKey: 'fasting-thursday',
		hadith: {
			text: 'تعرض الأعمال يوم الاثنين والخميس، فأحب أن يعرض عملي وأنا صائم.',
			source: { label: 'جامع الترمذي 747', url: 'https://sunnah.com/tirmidhi/8/66' },
		},
		excludedHijriDates: [
			{ month: 10, days: [1] }, // Eid al-Fitr (1 Shawwal)
			{ month: 12, days: [10, 11, 12, 13] }, // Eid al-Adha + Days of Tashriq (10-13 Dhul-Hijjah)
		],
	},
	{
		key: 'white-days',
		categoryKey: 'muhammed-way',
		leadDays: 1,
		matcher: { type: 'hijri-date', month: 0, days: [13, 14, 15] },
		messageKey: 'white-days',
		hadith: {
			text: 'إذا صمت من الشهر ثلاثة أيام، فصم ثلاث عشرة وأربع عشرة وخمس عشرة.',
			source: { label: 'جامع الترمذي 761', url: 'https://sunnah.com/tirmidhi:761' },
		},
	},
	{
		key: 'six-shawwal',
		categoryKey: 'special-occasions',
		leadDays: 1,
		matcher: { type: 'hijri-date', month: 10, days: [2] },
		messageKey: 'six-shawwal',
		hadith: {
			text: 'من صام رمضان ثم أتبعه ستا من شوال كان كصيام الدهر.',
			source: { label: 'صحيح مسلم 1164a', url: 'https://sunnah.com/muslim:1164a' },
		},
	},
	{
		key: 'arafah',
		categoryKey: 'special-occasions',
		leadDays: 1,
		matcher: { type: 'hijri-date', month: 12, days: [9] },
		messageKey: 'arafah',
		hadith: {
			text: 'صيام يوم عرفة يكفر السنة الماضية والباقية.',
			source: { label: 'صحيح مسلم 1162b', url: 'https://sunnah.com/urn/226030' },
		},
	},
	{
		key: 'tasua',
		categoryKey: 'special-occasions',
		leadDays: 1,
		matcher: { type: 'hijri-date', month: 1, days: [9] },
		messageKey: 'tasua',
		hadith: {
			text: 'فإذا كان العام المقبل إن شاء الله صمنا اليوم التاسع.',
			source: { label: 'صحيح مسلم 1134a', url: 'https://sunnah.com/muslim:1134a' },
		},
	},
	{
		key: 'ashura',
		categoryKey: 'special-occasions',
		leadDays: 1,
		matcher: { type: 'hijri-date', month: 1, days: [10] },
		messageKey: 'ashura',
		hadith: {
			text: 'صيام يوم عاشوراء يكفر السنة الماضية.',
			source: { label: 'صحيح مسلم 1162b', url: 'https://sunnah.com/urn/226030' },
		},
	},
	{
		key: 'dawwd-alternate',
		categoryKey: 'dawwd-alternate',
		leadDays: 1,
		matcher: { type: 'alternate-day-cycle' },
		messageKey: 'dawwd-alternate',
		hadith: {
			text: 'صيام الدعوض كانوا قوم يصومون غير يوم ولا يفطرون غير يوم، حتى إذا أطعموا من غير الصيام لم يطعموا إياهم، وإذا قيل لأحدهم امنحتني شيئًا من مالك ما منحهم إياه حتى رأياهم يا تقدموا إلينا شيئا نتصدق به فيسلم إلينا فسلمنا له.',
			source: { label: 'صحيح مسلم 1154a', url: 'https://sunnah.com/muslim:1154a' },
		},
		excludedHijriDates: [
			{ month: 10, days: [1] }, // Eid al-Fitr (1 Shawwal)
			{ month: 12, days: [10, 11, 12, 13] }, // Eid al-Adha + Days of Tashriq (10-13 Dhul-Hijjah)
		],
	},
	{
		key: 'ramadan-start',
		categoryKey: 'islamic-events',
		leadDays: 1,
		matcher: { type: 'hijri-date', month: 9, days: [1] },
		messageKey: 'ramadan-start',
		hadith: {
			text: 'لا تصوموا حتى تروا الهلال، ولا تفطروا حتى تروه.',
			source: { label: 'صحيح البخاري 1906', url: 'https://sunnah.com/bukhari:1906' },
		},
	},
	{
		key: 'eid-fitr',
		categoryKey: 'islamic-events',
		leadDays: 1,
		matcher: { type: 'hijri-date', month: 10, days: [1] },
		messageKey: 'eid-fitr',
		hadith: {
			text: 'نهى رسول الله صلى الله عليه وسلم عن صيام يوم الفطر ويوم الأضحى.',
			source: { label: 'صحيح البخاري 1990', url: 'https://sunnah.com/bukhari:1990' },
		},
	},
	{
		key: 'dhul-hijjah-ten',
		categoryKey: 'islamic-events',
		leadDays: 1,
		matcher: { type: 'hijri-date', month: 12, days: [1] },
		messageKey: 'dhul-hijjah-ten',
		hadith: {
			text: 'ما العمل في أيام العشر أفضل من العمل في هذه.',
			source: { label: 'صحيح البخاري 969', url: 'https://sunnah.com/dhulhijjah' },
		},
	},
	{
		key: 'eid-adha',
		categoryKey: 'islamic-events',
		leadDays: 1,
		matcher: { type: 'hijri-date', month: 12, days: [10] },
		messageKey: 'eid-adha',
		hadith: {
			text: 'نهى رسول الله صلى الله عليه وسلم عن صيام يوم الفطر ويوم الأضحى.',
			source: { label: 'صحيح البخاري 1990', url: 'https://sunnah.com/bukhari:1990' },
		},
	},
];

export function getSubscriptionReminderCategory(categoryKey: string | null | undefined) {
	if (!categoryKey || !isSubscriptionReminderCategoryKey(categoryKey)) {
		return null;
	}

	return subscriptionReminderCategories[categoryKey];
}

export function isSubscriptionReminderCategoryKey(value: string): value is SubscriptionReminderCategoryKey {
	return Object.prototype.hasOwnProperty.call(subscriptionReminderCategories, value);
}
