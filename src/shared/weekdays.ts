export interface WeekdayOption {
	key: string;
	value: number;
	label: string;
	cronValue: number;
}

export const weekdayOptions: WeekdayOption[] = [
	{ key: 'monday', value: 1, label: 'Monday', cronValue: 1 },
	{ key: 'tuesday', value: 2, label: 'Tuesday', cronValue: 2 },
	{ key: 'wednesday', value: 3, label: 'Wednesday', cronValue: 3 },
	{ key: 'thursday', value: 4, label: 'Thursday', cronValue: 4 },
	{ key: 'friday', value: 5, label: 'Friday', cronValue: 5 },
	{ key: 'saturday', value: 6, label: 'Saturday', cronValue: 6 },
	{ key: 'sunday', value: 7, label: 'Sunday', cronValue: 0 },
];

export const allWeekdayValues = weekdayOptions.map((weekday) => weekday.value);
export const weekdayValues = [1, 2, 3, 4, 5];
export const weekendValues = [6, 7];

const weekdayByKey = new Map(weekdayOptions.map((weekday) => [weekday.key, weekday]));
const weekdayByValue = new Map(weekdayOptions.map((weekday) => [weekday.value, weekday]));

interface ParseWeekdayInputOptions {
	allowShortcuts?: boolean;
}

export function parseWeekdayValues(values: string[]): number[] | null {
	const weekdays = values
		.map((value) => {
			const byKey = weekdayByKey.get(value);
			if (byKey) {
				return byKey.value;
			}

			const numberValue = Number.parseInt(value, 10);
			return weekdayByValue.has(numberValue) ? numberValue : null;
		})
		.filter((value): value is number => value !== null);

	if (weekdays.length !== values.length || weekdays.length === 0) {
		return null;
	}

	return normalizeWeekdays(weekdays);
}

export function parseWeekdayInput(input: string | null | undefined, options: ParseWeekdayInputOptions = {}): number[] | null {
	if (!input) {
		return null;
	}

	const normalizedInput = normalizeWeekdayInput(input);
	if (normalizedInput.length === 0) {
		return null;
	}

	if (options.allowShortcuts !== false) {
		if (['daily', 'everyday', 'every day', 'all', 'all days'].includes(normalizedInput)) {
			return allWeekdayValues;
		}

		if (['weekday', 'weekdays'].includes(normalizedInput)) {
			return weekdayValues;
		}

		if (['weekend', 'weekends'].includes(normalizedInput)) {
			return weekendValues;
		}
	}

	const parts = normalizedInput.split(',').map((part) => part.trim());

	if (parts.length === 0 || parts.some((part) => part.length === 0)) {
		return null;
	}

	const weekdays = parts.map((part) => weekdayByKey.get(part)?.value ?? null);
	if (weekdays.some((weekday) => weekday === null)) {
		return null;
	}

	return normalizeWeekdays(weekdays as number[]);
}

export function parseStoredWeekdays(value: string | null | undefined): number[] {
	if (!value) {
		return [];
	}

	return normalizeWeekdays(
		value
			.split(',')
			.map((part) => Number.parseInt(part, 10))
			.filter((part) => weekdayByValue.has(part))
	);
}

export function serializeWeekdays(weekdays: number[]): string {
	return normalizeWeekdays(weekdays).join(',');
}

export function formatWeekdays(weekdays: number[]): string {
	const normalizedWeekdays = normalizeWeekdays(weekdays);

	if (arraysEqual(normalizedWeekdays, allWeekdayValues)) {
		return 'every day';
	}

	if (arraysEqual(normalizedWeekdays, weekdayValues)) {
		return 'weekdays';
	}

	if (arraysEqual(normalizedWeekdays, weekendValues)) {
		return 'weekends';
	}

	return formatWeekdayNames(normalizedWeekdays);
}

export function formatWeekdayNames(weekdays: number[]): string {
	const labels = normalizeWeekdays(weekdays).map((weekday) => weekdayByValue.get(weekday)?.label ?? String(weekday));
	return joinHumanList(labels);
}

export function getCronWeekdayValue(weekday: number): number | null {
	return weekdayByValue.get(weekday)?.cronValue ?? null;
}

export function shiftIsoWeekday(weekday: number, dayOffset: number): number {
	const normalizedWeekday = weekdayByValue.has(weekday) ? weekday : 1;
	const zeroBased = normalizedWeekday - 1;
	const shifted = ((zeroBased + dayOffset) % 7 + 7) % 7;
	return shifted + 1;
}

export function getIsoWeekday(isoDate: string): number {
	const [year, month, day] = isoDate.split('-').map((value) => Number.parseInt(value, 10));
	const utcDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
	return utcDay === 0 ? 7 : utcDay;
}

function normalizeWeekdays(weekdays: number[]): number[] {
	return [...new Set(weekdays.filter((weekday) => weekdayByValue.has(weekday)))].sort((left, right) => left - right);
}

function normalizeWeekdayInput(input: string): string {
	return input.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

function arraysEqual(left: number[], right: number[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function joinHumanList(values: string[]): string {
	if (values.length <= 2) {
		return values.join(' and ');
	}

	return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`;
}
