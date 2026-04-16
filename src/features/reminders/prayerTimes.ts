import type { Configuration } from '../../storage/sqlite/repositories/ConfigurationRepository';
import { isValidTimeZone } from './cadence';

export const maqraahTimeSyncDefaults = {
	enabled: false,
	offsetMinutes: 30,
	latitude: 30.0444,
	longitude: 31.2357,
	calculationMethod: 5,
	bucketMinutes: 5,
} as const;

export interface MaqraahTimeSyncTiming {
	date: string;
	maghribTime: string;
	roundedMaghribTime: string;
	reminderTime: string;
}

interface AlAdhanTimingsResponse {
	code: number;
	status: string;
	data?: {
		timings?: {
			Maghrib?: string;
		};
	};
}

type FetchImplementation = typeof fetch;

export async function fetchMaqraahTimeSyncTiming(
	configuration: Configuration,
	date: Date = new Date(),
	fetchImplementation: FetchImplementation = fetch
): Promise<MaqraahTimeSyncTiming> {
	const timezone = configuration.timezone;
	if (!isValidTimeZone(timezone)) {
		throw new Error(`Invalid timezone configured for maqraah time sync: ${timezone}`);
	}

	const localDate = formatDateForAlAdhan(date, timezone);
	const url = buildAlAdhanTimingsUrl(configuration, localDate);
	const response = await fetchImplementation(url);

	if (!response.ok) {
		throw new Error(`AlAdhan timings request failed with status ${response.status}`);
	}

	const body = (await response.json()) as AlAdhanTimingsResponse;
	const maghribTime = body.data?.timings?.Maghrib;
	if (body.code !== 200 || !maghribTime) {
		throw new Error(`AlAdhan timings response did not include Maghrib time: ${body.status}`);
	}

	return buildMaqraahTimeSyncTiming(localDate, maghribTime, getMaqraahTimeSyncOffsetMinutes(configuration.maqraahTimeSyncOffsetMinutes));
}

export function buildMaqraahTimeSyncTiming(date: string, maghribTime: string, offsetMinutes: number): MaqraahTimeSyncTiming {
	const maghribMinutes = parsePrayerTimeToMinutes(maghribTime);
	if (maghribMinutes === null) {
		throw new Error(`Invalid Maghrib time returned by prayer API: ${maghribTime}`);
	}

	const roundedMaghribMinutes = floorToBucket(maghribMinutes, maqraahTimeSyncDefaults.bucketMinutes);
	return {
		date,
		maghribTime: minutesToDisplayTime(maghribMinutes),
		roundedMaghribTime: minutesToDisplayTime(roundedMaghribMinutes),
		reminderTime: minutesToDisplayTime(roundedMaghribMinutes + offsetMinutes),
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

export function isMaqraahTimeSyncEnabled(value: boolean | number | string | null | undefined): boolean {
	if (value === null || value === undefined) {
		return maqraahTimeSyncDefaults.enabled;
	}

	if (typeof value === 'boolean') {
		return value;
	}

	if (typeof value === 'number') {
		return value !== 0;
	}

	return value !== '0' && value.toLowerCase() !== 'false';
}

export function getMaqraahTimeSyncOffsetMinutes(value: number | null | undefined): number {
	if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
		return maqraahTimeSyncDefaults.offsetMinutes;
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

function getLatitude(value: number | null | undefined): number {
	return typeof value === 'number' && isValidLatitude(value) ? value : maqraahTimeSyncDefaults.latitude;
}

function getLongitude(value: number | null | undefined): number {
	return typeof value === 'number' && isValidLongitude(value) ? value : maqraahTimeSyncDefaults.longitude;
}

function getCalculationMethod(value: number | null | undefined): number {
	return typeof value === 'number' && isValidCalculationMethod(value) ? value : maqraahTimeSyncDefaults.calculationMethod;
}

function floorToBucket(minutes: number, bucketMinutes: number): number {
	return Math.floor(minutes / bucketMinutes) * bucketMinutes;
}
