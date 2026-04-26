import type { HijriCalendarCacheEntry } from '../../storage/sqlite/repositories/HijriCalendarCacheRepository';
import type { SubscriptionReminderEventDefinition } from './catalog';

export interface ReminderMessageInput {
	roleId: string;
	event: SubscriptionReminderEventDefinition;
	targetGregorianDate: string;
	hijriDate: HijriCalendarCacheEntry | null;
}

export function buildSubscriptionReminderMessage(input: ReminderMessageInput): string {
	const lines = [
		`<@&${input.roleId}>`,
		buildTemplateLine(input.event, input.hijriDate),
		`الحديث: ${input.event.hadith.text}`,
		`المصدر: ${input.event.hadith.source.label}: ${input.event.hadith.source.url}`,
	];

	return lines.join('\n');
}

function buildTemplateLine(event: SubscriptionReminderEventDefinition, hijriDate: HijriCalendarCacheEntry | null): string {
	switch (event.messageKey) {
		case 'fasting-monday':
			return 'غدا صيام يوم الاثنين.';
		case 'fasting-thursday':
			return 'غدا صيام يوم الخميس.';
		case 'white-days':
			return `غدا صيام اليوم الأبيض ${hijriDate?.hijriDay ?? ''} من ${getHijriMonthName(hijriDate)}.`;
		case 'six-shawwal':
			return 'من غد يبدأ صيام الست من شوال، وصمها قبل نهاية شوال.';
		case 'arafah':
			return 'غدا صيام يوم عرفة.';
		case 'tasua':
			return 'غدا صيام تاسوعاء.';
		case 'ashura':
			return 'غدا صيام عاشوراء.';
		case 'ramadan-start':
			return 'غدا يبدأ شهر رمضان.';
		case 'eid-fitr':
			return 'غدا عيد الفطر.';
		case 'dhul-hijjah-ten':
			return 'غدا تبدأ العشر من ذي الحجة.';
		case 'eid-adha':
			return 'غدا عيد الأضحى.';
		default:
			return 'تذكير بسيط.';
	}
}

function getHijriMonthName(hijriDate: HijriCalendarCacheEntry | null): string {
	if (!hijriDate) {
		return '';
	}

	return hijriDate.hijriMonthNameAr || hijriDate.hijriMonthNameEn;
}
