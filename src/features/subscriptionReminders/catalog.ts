export const subscriptionReminderCategories = {
	fasting: {
		key: 'fasting',
		roleName: 'تذكيرات الصيام',
		label: 'Fasting',
		description: 'Optional fasting reminders',
	},
	'islamic-events': {
		key: 'islamic-events',
		roleName: 'تذكيرات المناسبات الإسلامية',
		label: 'Islamic events',
		description: 'Optional Islamic event reminders',
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
	  };

export interface ReminderSourceReference {
	label: string;
	url: string;
}

export interface SubscriptionReminderEventDefinition {
	key: string;
	categoryKey: SubscriptionReminderCategoryKey;
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
		| 'eid-adha';
	sources: ReminderSourceReference[];
}

export const subscriptionReminderEvents: SubscriptionReminderEventDefinition[] = [
	{
		key: 'fasting-monday',
		categoryKey: 'fasting',
		matcher: { type: 'gregorian-weekday', weekday: 1 },
		messageKey: 'fasting-monday',
		sources: [{ label: 'جامع الترمذي 747', url: 'https://sunnah.com/tirmidhi:747' }],
	},
	{
		key: 'fasting-thursday',
		categoryKey: 'fasting',
		matcher: { type: 'gregorian-weekday', weekday: 4 },
		messageKey: 'fasting-thursday',
		sources: [{ label: 'جامع الترمذي 747', url: 'https://sunnah.com/tirmidhi:747' }],
	},
	{
		key: 'white-days',
		categoryKey: 'fasting',
		matcher: { type: 'hijri-date', month: 0, days: [13, 14, 15] },
		messageKey: 'white-days',
		sources: [{ label: 'جامع الترمذي 761', url: 'https://sunnah.com/tirmidhi:761' }],
	},
	{
		key: 'six-shawwal',
		categoryKey: 'fasting',
		matcher: { type: 'hijri-date', month: 10, days: [2, 9, 16, 23] },
		messageKey: 'six-shawwal',
		sources: [{ label: 'صحيح مسلم 1164a', url: 'https://sunnah.com/muslim:1164a' }],
	},
	{
		key: 'arafah',
		categoryKey: 'fasting',
		matcher: { type: 'hijri-date', month: 12, days: [9] },
		messageKey: 'arafah',
		sources: [{ label: 'صحيح مسلم 1162b', url: 'https://sunnah.com/muslim:1162b' }],
	},
	{
		key: 'tasua',
		categoryKey: 'fasting',
		matcher: { type: 'hijri-date', month: 1, days: [9] },
		messageKey: 'tasua',
		sources: [{ label: 'صحيح مسلم 1134a', url: 'https://sunnah.com/muslim:1134a' }],
	},
	{
		key: 'ashura',
		categoryKey: 'fasting',
		matcher: { type: 'hijri-date', month: 1, days: [10] },
		messageKey: 'ashura',
		sources: [
			{ label: 'صحيح مسلم 1134a', url: 'https://sunnah.com/muslim:1134a' },
			{ label: 'صحيح مسلم 1162b', url: 'https://sunnah.com/muslim:1162b' },
		],
	},
	{
		key: 'ramadan-start',
		categoryKey: 'islamic-events',
		matcher: { type: 'hijri-date', month: 9, days: [1] },
		messageKey: 'ramadan-start',
		sources: [],
	},
	{
		key: 'eid-fitr',
		categoryKey: 'islamic-events',
		matcher: { type: 'hijri-date', month: 10, days: [1] },
		messageKey: 'eid-fitr',
		sources: [],
	},
	{
		key: 'dhul-hijjah-ten',
		categoryKey: 'islamic-events',
		matcher: { type: 'hijri-date', month: 12, days: [1] },
		messageKey: 'dhul-hijjah-ten',
		sources: [],
	},
	{
		key: 'eid-adha',
		categoryKey: 'islamic-events',
		matcher: { type: 'hijri-date', month: 12, days: [10] },
		messageKey: 'eid-adha',
		sources: [],
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
