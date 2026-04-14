import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export const REMINDER_CUSTOM_ID_PREFIX = 'reminder';

export const reminderActions = {
	JOINING_SHORTLY: 'joining-shortly',
	CANNOT_MAKE_IT: 'cannot-make-it',
} as const;

export type ReminderAction = (typeof reminderActions)[keyof typeof reminderActions];

export interface ReminderActionCustomId {
	action: ReminderAction;
	sessionId: string;
}

export function getReminderSessionId(date: Date = new Date(), timezone?: string): string {
	if (!timezone) {
		return date.toISOString().slice(0, 10);
	}

	const dateParts = new Intl.DateTimeFormat('en-US', {
		timeZone: timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).formatToParts(date);
	const year = dateParts.find((part) => part.type === 'year')?.value;
	const month = dateParts.find((part) => part.type === 'month')?.value;
	const day = dateParts.find((part) => part.type === 'day')?.value;

	if (!year || !month || !day) {
		return date.toISOString().slice(0, 10);
	}

	return `${year}-${month}-${day}`;
}

export function buildReminderActionCustomId(action: ReminderAction, sessionId: string = getReminderSessionId()): string {
	return `${REMINDER_CUSTOM_ID_PREFIX}:${action}:${sessionId}`;
}

export function parseReminderActionCustomId(customId: string): ReminderActionCustomId | null {
	const [prefix, action, sessionId] = customId.split(':');

	if (prefix !== REMINDER_CUSTOM_ID_PREFIX || !sessionId || !isReminderAction(action)) {
		return null;
	}

	return { action, sessionId };
}

export function buildReminderActionRows(sessionId: string = getReminderSessionId(), disabled: boolean = false): ActionRowBuilder<ButtonBuilder>[] {
	const joiningShortlyButton = new ButtonBuilder()
		.setCustomId(buildReminderActionCustomId(reminderActions.JOINING_SHORTLY, sessionId))
		.setLabel('هتاخر شوية')
		.setEmoji('⚠️')
		.setStyle(ButtonStyle.Secondary)
		.setDisabled(disabled);

	const cannotMakeItButton = new ButtonBuilder()
		.setCustomId(buildReminderActionCustomId(reminderActions.CANNOT_MAKE_IT, sessionId))
		.setLabel('مش هقدر أحضر')
		.setStyle(ButtonStyle.Danger)
		.setDisabled(disabled);

	return [new ActionRowBuilder<ButtonBuilder>().addComponents(joiningShortlyButton, cannotMakeItButton)];
}

function isReminderAction(action: string | undefined): action is ReminderAction {
	return Object.values(reminderActions).includes(action as ReminderAction);
}
