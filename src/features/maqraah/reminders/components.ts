import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getReminderSessionId } from './sessionId';

export const REMINDER_CUSTOM_ID_PREFIX = 'reminder';

export const reminderActions = {
	JOINING_SHORTLY: 'joining-shortly',
	CANNOT_MAKE_IT: 'cannot-make-it',
	CARRY_OVER_NOTES: 'carry-over-notes',
} as const;

export type ReminderAction = (typeof reminderActions)[keyof typeof reminderActions];

export interface ReminderActionCustomId {
	action: ReminderAction;
	sessionId: string;
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

export function buildNotesCarryOverActionRows(sessionId: string = getReminderSessionId(), disabled: boolean = false): ActionRowBuilder<ButtonBuilder>[] {
	const carryOverNotesButton = new ButtonBuilder()
		.setCustomId(buildReminderActionCustomId(reminderActions.CARRY_OVER_NOTES, sessionId))
		.setLabel('رحّل الملاحظات لمقراة بكرة')
		.setStyle(ButtonStyle.Primary)
		.setDisabled(disabled);

	return [new ActionRowBuilder<ButtonBuilder>().addComponents(carryOverNotesButton)];
}

function isReminderAction(action: string | undefined): action is ReminderAction {
	return Object.values(reminderActions).includes(action as ReminderAction);
}
