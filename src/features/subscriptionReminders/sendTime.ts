import { parseReminderTime } from '../../shared/time';
import { formatPrayerName, normalizePrayerName, type PrayerName } from '../../shared/prayers';
import {
	reminderSendTimeModes,
	type ReminderSettings,
	type UpdateReminderSettingsInput,
} from '../../storage/sqlite/repositories/ReminderSettingsRepository';

export type ParsedSubscriptionReminderSendTime =
	| {
			mode: typeof reminderSendTimeModes.FIXED;
			sendTime: string;
	  }
	| {
			mode: typeof reminderSendTimeModes.PRAYER;
			sendPrayer: PrayerName;
	  };

const prayerSyncKeywordPattern = /^\s*sync-to-([a-z]+)\s*$/i;

export function parseSubscriptionReminderSendTime(input: string | null | undefined): ParsedSubscriptionReminderSendTime | null {
	const parsedTime = parseReminderTime(input);
	if (parsedTime) {
		return {
			mode: reminderSendTimeModes.FIXED,
			sendTime: parsedTime.displayTime,
		};
	}

	if (typeof input !== 'string') {
		return null;
	}

	const match = input.match(prayerSyncKeywordPattern);
	const sendPrayer = normalizePrayerName(match?.[1]);
	if (!sendPrayer) {
		return null;
	}

	return {
		mode: reminderSendTimeModes.PRAYER,
		sendPrayer,
	};
}

export function buildSendTimeUpdates(parsed: ParsedSubscriptionReminderSendTime): UpdateReminderSettingsInput {
	if (parsed.mode === reminderSendTimeModes.FIXED) {
		return {
			sendTime: parsed.sendTime,
			sendTimeMode: reminderSendTimeModes.FIXED,
			sendPrayer: null,
		};
	}

	return {
		sendTimeMode: reminderSendTimeModes.PRAYER,
		sendPrayer: parsed.sendPrayer,
	};
}

export function formatSubscriptionReminderSendTime(settings: ReminderSettings): string {
	if (settings.sendTimeMode === reminderSendTimeModes.PRAYER && settings.sendPrayer) {
		return `Synced to ${formatPrayerName(settings.sendPrayer)} prayer`;
	}

	return `Fixed time: ${settings.sendTime}`;
}
