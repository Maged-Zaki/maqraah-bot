import type { Configuration } from '../../storage/sqlite/repositories/ConfigurationRepository';
import type { PrayerName } from '../prayers';
import { normalizeTimeZone } from '../time';

export const prayerSyncDefaults = {
	offsetMinutes: 30,
	latitude: 30.0444,
	longitude: 31.2357,
	calculationMethod: 5,
	bucketMinutes: 5,
} as const;

export interface PrayerSyncTiming {
	date: string;
	prayer: PrayerName;
	prayerTime: string;
	roundedPrayerTime: string;
	reminderTime: string;
}

export interface PrayerTiming {
	date: string;
	prayer: PrayerName;
	rawPrayerTime: string;
	prayerTime: string;
	minutesSinceMidnight: number;
}

type AlAdhanPrayerTimingKey = 'Fajr' | 'Sunrise' | 'Dhuhr' | 'Asr' | 'Maghrib' | 'Isha';

type AlAdhanPrayerTimings = Partial<Record<AlAdhanPrayerTimingKey, string>>;

interface AlAdhanTimingsResponse {
	code: number;
	status: string;
	data?: {
		timings?: AlAdhanPrayerTimings;
	};
}

type FetchImplementation = typeof fetch;

const alAdhanPrayerTimingKeys: Record<PrayerName, AlAdhanPrayerTimingKey> = {
	fajr: 'Fajr',
	sunrise: 'Sunrise',
	dhuhr: 'Dhuhr',
	asr: 'Asr',
	maghrib: 'Maghrib',
	isha: 'Isha',
};

export async function fetchPrayerTiming(
	configuration: Configuration,
	prayer: PrayerName,
	date: Date = new Date(),
	fetchImplementation: FetchImplementation = fetch
): Promise<PrayerTiming> {
	const timezone = normalizeTimeZone(configuration.timezone);
	if (!timezone) {
		throw new Error(`Invalid timezone configured for prayer time lookup: ${configuration.timezone}`);
	}

	const localDate = formatDateForAlAdhan(date, timezone);
	const url = buildAlAdhanTimingsUrl({ ...configuration, timezone }, localDate);
	const timings = await fetchAlAdhanTimings(url, fetchImplementation);
	const alAdhanPrayerKey = alAdhanPrayerTimingKeys[prayer];
	const rawPrayerTime = timings[alAdhanPrayerKey];
	if (!rawPrayerTime) {
		throw new Error(`AlAdhan timings response did not include ${alAdhanPrayerKey} time.`);
	}

	const minutesSinceMidnight = parsePrayerTimeToMinutes(rawPrayerTime);
	if (minutesSinceMidnight === null) {
		throw new Error(`Invalid ${alAdhanPrayerKey} time returned by prayer API: ${rawPrayerTime}`);
	}

	return {
		date: localDate,
		prayer,
		rawPrayerTime,
		prayerTime: minutesToDisplayTime(minutesSinceMidnight),
		minutesSinceMidnight,
	};
}

export async function fetchPrayerSyncTiming(
	configuration: Configuration,
	prayer: PrayerName,
	offsetMinutes: number,
	date: Date = new Date(),
	fetchImplementation: FetchImplementation = fetch
): Promise<PrayerSyncTiming> {
	const timing = await fetchPrayerTiming(configuration, prayer, date, fetchImplementation);
	return buildPrayerSyncTiming(timing.date, prayer, timing.rawPrayerTime, offsetMinutes);
}

export function buildPrayerSyncTiming(
	date: string,
	prayer: PrayerName,
	rawPrayerTime: string,
	offsetMinutes: number,
	bucketMinutes: number = prayerSyncDefaults.bucketMinutes
): PrayerSyncTiming {
	const prayerMinutes = parsePrayerTimeToMinutes(rawPrayerTime);
	if (prayerMinutes === null) {
		throw new Error(`Invalid prayer time returned by prayer API: ${rawPrayerTime}`);
	}

	const roundedPrayerMinutes = floorToBucket(prayerMinutes, bucketMinutes);
	return {
		date,
		prayer,
		prayerTime: minutesToDisplayTime(prayerMinutes),
		roundedPrayerTime: minutesToDisplayTime(roundedPrayerMinutes),
		reminderTime: minutesToDisplayTime(roundedPrayerMinutes + offsetMinutes),
	};
}

export function formatDateForAlAdhan(date: Date, timezone: string): string {
	const parts = new Intl.DateTimeFormat('en-GB', {
		timeZone: timezone,
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
	}).formatToParts(date);

	const day = parts.find((part) => part.type === 'day')?.value;
	const month = parts.find((part) => part.type === 'month')?.value;
	const year = parts.find((part) => part.type === 'year')?.value;

	if (!day || !month || !year) {
		throw new Error(`Could not format date for timezone: ${timezone}`);
	}

	return `${day}-${month}-${year}`;
}

export function parsePrayerTimeToMinutes(time: string): number | null {
	const match = time.match(/^(\d{1,2}):(\d{2})/);
	if (!match) {
		return null;
	}

	const hour = Number.parseInt(match[1], 10);
	const minute = Number.parseInt(match[2], 10);

	if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
		return null;
	}

	return hour * 60 + minute;
}

export function minutesToDisplayTime(minutes: number): string {
	const normalizedMinutes = ((minutes % 1440) + 1440) % 1440;
	const hour24 = Math.floor(normalizedMinutes / 60);
	const minute = normalizedMinutes % 60;
	const ampm = hour24 >= 12 ? 'PM' : 'AM';
	const hour12 = hour24 % 12 || 12;

	return `${hour12}:${minute.toString().padStart(2, '0')} ${ampm}`;
}

export function isPrayerSyncEnabled(value: boolean | number | string | null | undefined, defaultValue: boolean = false): boolean {
	if (value === null || value === undefined) {
		return defaultValue;
	}

	if (typeof value === 'boolean') {
		return value;
	}

	if (typeof value === 'number') {
		return value !== 0;
	}

	return value !== '0' && value.toLowerCase() !== 'false';
}

export function getPrayerSyncOffsetMinutes(value: number | null | undefined, defaultValue: number = prayerSyncDefaults.offsetMinutes): number {
	if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
		return defaultValue;
	}

	return value;
}

export function isValidLatitude(value: number): boolean {
	return Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLongitude(value: number): boolean {
	return Number.isFinite(value) && value >= -180 && value <= 180;
}

export function isValidCalculationMethod(value: number): boolean {
	return Number.isInteger(value) && value >= 0;
}

export function buildAlAdhanTimingsUrl(configuration: Configuration, date: string): string {
	const url = new URL(`https://api.aladhan.com/v1/timings/${date}`);
	url.searchParams.set('latitude', getLatitude(configuration.maqraahTimeSyncLatitude).toString());
	url.searchParams.set('longitude', getLongitude(configuration.maqraahTimeSyncLongitude).toString());
	url.searchParams.set('method', getCalculationMethod(configuration.maqraahTimeSyncCalculationMethod).toString());
	url.searchParams.set('timezonestring', configuration.timezone);
	return url.toString();
}

async function fetchAlAdhanTimings(url: string, fetchImplementation: FetchImplementation): Promise<AlAdhanPrayerTimings> {
	const response = await fetchImplementation(url);

	if (!response.ok) {
		throw new Error(`AlAdhan timings request failed with status ${response.status}`);
	}

	const body = (await response.json()) as AlAdhanTimingsResponse;
	if (body.code !== 200 || !body.data?.timings) {
		throw new Error(`AlAdhan timings response was invalid: ${body.status}`);
	}

	return body.data.timings;
}

function getLatitude(value: number | null | undefined): number {
	return typeof value === 'number' && isValidLatitude(value) ? value : prayerSyncDefaults.latitude;
}

function getLongitude(value: number | null | undefined): number {
	return typeof value === 'number' && isValidLongitude(value) ? value : prayerSyncDefaults.longitude;
}

function getCalculationMethod(value: number | null | undefined): number {
	return typeof value === 'number' && isValidCalculationMethod(value) ? value : prayerSyncDefaults.calculationMethod;
}

function floorToBucket(minutes: number, bucketMinutes: number): number {
	return Math.floor(minutes / bucketMinutes) * bucketMinutes;
}
