import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { buildQuranPageImageUrl, buildQuranPageReadUrl } from '../../../shared/quran/pageImages';
import { getHifzReminderSessionId } from './sessionId';

export const HIFZ_REMINDER_CUSTOM_ID_PREFIX = 'hifz-reminder';

export const hifzReminderActions = {
	JOINING_SHORTLY: 'joining-shortly',
	CANNOT_MAKE_IT: 'cannot-make-it',
	PREVIOUS_QURAN_PAGE: 'previous-quran-page',
	NEXT_QURAN_PAGE: 'next-quran-page',
} as const;

export type HifzReminderAction = (typeof hifzReminderActions)[keyof typeof hifzReminderActions];
type QuranPageAction = typeof hifzReminderActions.PREVIOUS_QURAN_PAGE | typeof hifzReminderActions.NEXT_QURAN_PAGE;

export interface BaseHifzReminderActionCustomId {
	action: Exclude<HifzReminderAction, QuranPageAction>;
	sessionId: string;
}

export interface HifzQuranPageActionCustomId {
	action: QuranPageAction;
	sessionId: string;
	page: number;
}

export type HifzReminderActionCustomId = BaseHifzReminderActionCustomId | HifzQuranPageActionCustomId;

export function buildHifzReminderActionCustomId(action: Exclude<HifzReminderAction, QuranPageAction>, sessionId: string = getHifzReminderSessionId()): string {
	return `${HIFZ_REMINDER_CUSTOM_ID_PREFIX}:${action}:${sessionId}`;
}

export function buildHifzPreviousQuranPageActionCustomId(sessionId: string, page: number): string {
	return `${HIFZ_REMINDER_CUSTOM_ID_PREFIX}:${hifzReminderActions.PREVIOUS_QURAN_PAGE}:${sessionId}:${page}`;
}

export function buildHifzNextQuranPageActionCustomId(sessionId: string, page: number): string {
	return `${HIFZ_REMINDER_CUSTOM_ID_PREFIX}:${hifzReminderActions.NEXT_QURAN_PAGE}:${sessionId}:${page}`;
}

export function parseHifzReminderActionCustomId(customId: string): HifzReminderActionCustomId | null {
	const [prefix, action, sessionId, pageValue, ...extraParts] = customId.split(':');

	if (prefix !== HIFZ_REMINDER_CUSTOM_ID_PREFIX || !sessionId || !isHifzReminderAction(action)) {
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

export function buildHifzReminderActionRows(sessionId: string = getHifzReminderSessionId(), disabled: boolean = false): ActionRowBuilder<ButtonBuilder>[] {
	const joiningShortlyButton = new ButtonBuilder()
		.setCustomId(buildHifzReminderActionCustomId(hifzReminderActions.JOINING_SHORTLY, sessionId))
		.setLabel('هتاخر شوية')
		.setEmoji('⚠️')
		.setStyle(ButtonStyle.Secondary)
		.setDisabled(disabled);

	const cannotMakeItButton = new ButtonBuilder()
		.setCustomId(buildHifzReminderActionCustomId(hifzReminderActions.CANNOT_MAKE_IT, sessionId))
		.setLabel('مش هقدر أحضر')
		.setStyle(ButtonStyle.Danger)
		.setDisabled(disabled);

	return [new ActionRowBuilder<ButtonBuilder>().addComponents(joiningShortlyButton, cannotMakeItButton)];
}

export function buildCurrentHifzPagePrompt(sessionId: string, page: number): {
	embeds: EmbedBuilder[];
	components: ActionRowBuilder<ButtonBuilder>[];
} {
	return {
		embeds: [buildCurrentHifzPageEmbed(page)],
		components: buildCurrentHifzPageActionRows(sessionId, page),
	};
}

export function buildCurrentHifzPageActionRows(sessionId: string, page: number): ActionRowBuilder<ButtonBuilder>[] {
	const previousPageButton = new ButtonBuilder()
		.setCustomId(buildHifzPreviousQuranPageActionCustomId(sessionId, page))
		.setLabel('Previous')
		.setEmoji('⬅️')
		.setStyle(ButtonStyle.Secondary);

	const nextPageButton = new ButtonBuilder()
		.setCustomId(buildHifzNextQuranPageActionCustomId(sessionId, page))
		.setLabel('Next')
		.setEmoji('➡️')
		.setStyle(ButtonStyle.Primary);

	return [new ActionRowBuilder<ButtonBuilder>().addComponents(previousPageButton, nextPageButton)];
}

function buildCurrentHifzPageEmbed(page: number): EmbedBuilder {
	return new EmbedBuilder()
		.setTitle(`صفحة الحفظ - Page ${page}`)
		.setURL(buildQuranPageReadUrl(page))
		.setImage(buildQuranPageImageUrl(page))
		.setColor(0x0099ff);
}

function isHifzReminderAction(action: string | undefined): action is HifzReminderAction {
	return Object.values(hifzReminderActions).includes(action as HifzReminderAction);
}

function isQuranPageAction(action: HifzReminderAction): action is QuranPageAction {
	return action === hifzReminderActions.PREVIOUS_QURAN_PAGE || action === hifzReminderActions.NEXT_QURAN_PAGE;
}
