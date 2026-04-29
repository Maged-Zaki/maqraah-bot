export const prayerNames = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;

export type PrayerName = (typeof prayerNames)[number];

const prayerAliases: Record<string, PrayerName> = {
	fajr: 'fajr',
	sunrise: 'sunrise',
	dhuhr: 'dhuhr',
	asr: 'asr',
	maghrib: 'maghrib',
	isha: 'isha',
};

const prayerDisplayNames: Record<PrayerName, string> = {
	fajr: 'Fajr',
	sunrise: 'Sunrise',
	dhuhr: 'Dhuhr',
	asr: 'Asr',
	maghrib: 'Maghrib',
	isha: 'Isha',
};

export function normalizePrayerName(value: string | null | undefined): PrayerName | null {
	if (typeof value !== 'string') {
		return null;
	}

	return prayerAliases[value.trim().toLowerCase()] ?? null;
}

export function formatPrayerName(prayer: PrayerName): string {
	return prayerDisplayNames[prayer];
}
