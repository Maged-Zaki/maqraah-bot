import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { buildQuranPageImageUrl, buildQuranPageReadUrl, quranPageImageSource } from '../../../shared/quran/pageImages';
import { getReminderSessionId } from './sessionId';

export const REMINDER_CUSTOM_ID_PREFIX = 'reminder';

export const reminderActions = {
	JOINING_SHORTLY: 'joining-shortly',
	CANNOT_MAKE_IT: 'cannot-make-it',
	CARRY_OVER_NOTES: 'carry-over-notes',
	PREVIOUS_QURAN_PAGE: 'previous-quran-page',
	NEXT_QURAN_PAGE: 'next-quran-page',
} as const;

export type ReminderAction = (typeof reminderActions)[keyof typeof reminderActions];
type QuranPageAction = typeof reminderActions.PREVIOUS_QURAN_PAGE | typeof reminderActions.NEXT_QURAN_PAGE;

export interface BaseReminderActionCustomId {
	action: Exclude<ReminderAction, QuranPageAction>;
	sessionId: string;
}

export interface QuranPageActionCustomId {
	action: QuranPageAction;
	sessionId: string;
	page: number;
}

export type ReminderActionCustomId = BaseReminderActionCustomId | QuranPageActionCustomId;

export function buildReminderActionCustomId(action: Exclude<ReminderAction, QuranPageAction>, sessionId: string = getReminderSessionId()): string {
	return `${REMINDER_CUSTOM_ID_PREFIX}:${action}:${sessionId}`;
}

export function buildPreviousQuranPageActionCustomId(sessionId: string, page: number): string {
	return `${REMINDER_CUSTOM_ID_PREFIX}:${reminderActions.PREVIOUS_QURAN_PAGE}:${sessionId}:${page}`;
}

export function buildNextQuranPageActionCustomId(sessionId: string, page: number): string {
	return `${REMINDER_CUSTOM_ID_PREFIX}:${reminderActions.NEXT_QURAN_PAGE}:${sessionId}:${page}`;
}

export function parseReminderActionCustomId(customId: string): ReminderActionCustomId | null {
	const [prefix, action, sessionId, pageValue, ...extraParts] = customId.split(':');

	if (prefix !== REMINDER_CUSTOM_ID_PREFIX || !sessionId || !isReminderAction(action)) {
		return null;
	}

	if (isQuranPageAction(action)) {
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
	return `Current page: ${page}`;
}

export function buildCurrentQuranPagePrompt(sessionId: string, page: number): {
	content: string;
	embeds: EmbedBuilder[];
	components: ActionRowBuilder<ButtonBuilder>[];
} {
	return {
		content: buildCurrentQuranPageMessage(page),
		embeds: [buildCurrentQuranPageEmbed(page)],
		components: buildCurrentQuranPageActionRows(sessionId, page),
	};
}

export function buildCurrentQuranPageActionRows(sessionId: string, page: number): ActionRowBuilder<ButtonBuilder>[] {
	const previousPageButton = new ButtonBuilder()
		.setCustomId(buildPreviousQuranPageActionCustomId(sessionId, page))
		.setLabel('Previous')
		.setEmoji('⬅️')
		.setStyle(ButtonStyle.Secondary);

	const nextPageButton = new ButtonBuilder()
		.setCustomId(buildNextQuranPageActionCustomId(sessionId, page))
		.setLabel('Next')
		.setEmoji('➡️')
		.setStyle(ButtonStyle.Primary);

	return [new ActionRowBuilder<ButtonBuilder>().addComponents(previousPageButton, nextPageButton)];
}

function buildCurrentQuranPageEmbed(page: number): EmbedBuilder {
	return new EmbedBuilder()
		.setTitle(`Read page ${page}`)
		.setURL(buildQuranPageReadUrl(page))
		.setImage(buildQuranPageImageUrl(page))
		.setColor(0x0099ff)
		.setFooter({ text: `Image source: ${quranPageImageSource.name}` });
}

function isReminderAction(action: string | undefined): action is ReminderAction {
	return Object.values(reminderActions).includes(action as ReminderAction);
}

function isQuranPageAction(action: ReminderAction): action is QuranPageAction {
	return action === reminderActions.PREVIOUS_QURAN_PAGE || action === reminderActions.NEXT_QURAN_PAGE;
}
