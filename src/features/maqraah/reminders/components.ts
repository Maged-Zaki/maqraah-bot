import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getReminderSessionId } from './sessionId';

export const REMINDER_CUSTOM_ID_PREFIX = 'reminder';

export const reminderActions = {
	JOINING_SHORTLY: 'joining-shortly',
	CANNOT_MAKE_IT: 'cannot-make-it',
	CARRY_OVER_NOTES: 'carry-over-notes',
	NEXT_QURAN_PAGE: 'next-quran-page',
} as const;

export type ReminderAction = (typeof reminderActions)[keyof typeof reminderActions];

export interface BaseReminderActionCustomId {
	action: Exclude<ReminderAction, typeof reminderActions.NEXT_QURAN_PAGE>;
	sessionId: string;
}

export interface NextQuranPageActionCustomId {
	action: typeof reminderActions.NEXT_QURAN_PAGE;
	sessionId: string;
	page: number;
}

export type ReminderActionCustomId = BaseReminderActionCustomId | NextQuranPageActionCustomId;

export function buildReminderActionCustomId(action: Exclude<ReminderAction, typeof reminderActions.NEXT_QURAN_PAGE>, sessionId: string = getReminderSessionId()): string {
	return `${REMINDER_CUSTOM_ID_PREFIX}:${action}:${sessionId}`;
}

export function buildNextQuranPageActionCustomId(sessionId: string, page: number): string {
	return `${REMINDER_CUSTOM_ID_PREFIX}:${reminderActions.NEXT_QURAN_PAGE}:${sessionId}:${page}`;
}

export function parseReminderActionCustomId(customId: string): ReminderActionCustomId | null {
	const [prefix, action, sessionId, pageValue, ...extraParts] = customId.split(':');

	if (prefix !== REMINDER_CUSTOM_ID_PREFIX || !sessionId || !isReminderAction(action)) {
		return null;
	}

	if (action === reminderActions.NEXT_QURAN_PAGE) {
		if (!pageValue || extraParts.length > 0 || !/^\d+$/.test(pageValue)) {
			return null;
		}

		const page = Number(pageValue);
		if (!Number.isInteger(page)) {
			return null;
		}

		return { action, sessionId, page };
	}

	if (pageValue !== undefined) {
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

export function buildCurrentQuranPageMessage(page: number): string {
	return `Current page: **${page}**`;
}

export function buildCurrentQuranPageActionRows(sessionId: string, page: number): ActionRowBuilder<ButtonBuilder>[] {
	const nextPageButton = new ButtonBuilder()
		.setCustomId(buildNextQuranPageActionCustomId(sessionId, page))
		.setLabel('Next page')
		.setStyle(ButtonStyle.Primary);

	return [new ActionRowBuilder<ButtonBuilder>().addComponents(nextPageButton)];
}

function isReminderAction(action: string | undefined): action is ReminderAction {
	return Object.values(reminderActions).includes(action as ReminderAction);
}
