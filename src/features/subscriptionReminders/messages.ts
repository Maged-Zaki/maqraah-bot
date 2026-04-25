import type { HijriCalendarCacheEntry } from '../../storage/sqlite/repositories/HijriCalendarCacheRepository';
import type { SubscriptionReminderEventDefinition } from './catalog';
import { formatArabicDateLabel } from './dateUtils';

export interface ReminderMessageInput {
	roleId: string;
	event: SubscriptionReminderEventDefinition;
	targetGregorianDate: string;
	hijriDate: HijriCalendarCacheEntry | null;
}

export function buildSubscriptionReminderMessage(input: ReminderMessageInput): string {
	const lines = [
		`<@&${input.roleId}>`,
		buildTemplateLine(input.event, input.targetGregorianDate, input.hijriDate),
		`الموعد: ${formatArabicDateLabel(input.targetGregorianDate)}${formatHijriLabel(input.hijriDate)}`,
	];

	if (input.event.sources.length > 0) {
		lines.push('المراجع:');
		for (const source of input.event.sources) {
			lines.push(`${source.label}: ${source.url}`);
		}
	}

	return lines.join('\n');
}

function buildTemplateLine(event: SubscriptionReminderEventDefinition, targetGregorianDate: string, hijriDate: HijriCalendarCacheEntry | null): string {
	switch (event.messageKey) {
		case 'fasting-monday':
			return 'تذكير: صيام يوم الاثنين.';
		case 'fasting-thursday':
			return 'تذكير: صيام يوم الخميس.';
		case 'white-days':
			return `تذكير: صيام اليوم الأبيض ${hijriDate?.hijriDay ?? ''} من ${getHijriMonthName(hijriDate)}.`;
		case 'six-shawwal':
			return 'تذكير: من أيام صيام الست من شوال.';
		case 'arafah':
			return 'تذكير: صيام يوم عرفة.';
		case 'tasua':
			return 'تذكير: صيام تاسوعاء.';
		case 'ashura':
			return 'تذكير: صيام عاشوراء.';
		case 'ramadan-start':
			return 'تذكير: بداية شهر رمضان.';
		case 'eid-fitr':
			return 'تذكير: عيد الفطر.';
		case 'dhul-hijjah-ten':
			return 'تذكير: بداية الأيام العشر من ذي الحجة.';
		case 'eid-adha':
			return 'تذكير: عيد الأضحى.';
		default:
			return `تذكير بتاريخ ${targetGregorianDate}.`;
	}
}

function formatHijriLabel(hijriDate: HijriCalendarCacheEntry | null): string {
	if (!hijriDate) {
		return '';
	}

	return ` / ${hijriDate.hijriDay} ${getHijriMonthName(hijriDate)} ${hijriDate.hijriYear} هـ`;
}

function getHijriMonthName(hijriDate: HijriCalendarCacheEntry | null): string {
	if (!hijriDate) {
		return '';
	}

	return hijriDate.hijriMonthNameAr || hijriDate.hijriMonthNameEn;
}
