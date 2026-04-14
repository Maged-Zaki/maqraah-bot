import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export const REMINDER_CUSTOM_ID_PREFIX = 'reminder';
export const JOINING_SHORTLY_MODAL_ACTION = 'joining-shortly-minutes';
export const JOINING_SHORTLY_MINUTES_INPUT_ID = 'minutes';

export const reminderActions = {
	JOINING_SHORTLY: 'joining-shortly',
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

export function buildJoiningShortlyModalCustomId(sessionId: string): string {
	return `${REMINDER_CUSTOM_ID_PREFIX}:${JOINING_SHORTLY_MODAL_ACTION}:${sessionId}`;
}

export function buildDiscordChannelUrl(guildId: string | undefined, channelId: string | undefined): string | null {
	if (!guildId || !channelId) {
		return null;
	}

	return `https://discord.com/channels/${guildId}/${channelId}`;
}

export function parseReminderActionCustomId(customId: string): ReminderActionCustomId | null {
	const [prefix, action, sessionId] = customId.split(':');

	if (prefix !== REMINDER_CUSTOM_ID_PREFIX || !sessionId || !isReminderAction(action)) {
		return null;
	}

	return { action, sessionId };
}

export function parseJoiningShortlyModalCustomId(customId: string): string | null {
	const [prefix, action, sessionId] = customId.split(':');

	if (prefix !== REMINDER_CUSTOM_ID_PREFIX || action !== JOINING_SHORTLY_MODAL_ACTION || !sessionId) {
		return null;
	}

	return sessionId;
}

export function buildReminderActionRows(
	sessionId: string = getReminderSessionId(),
	voiceChannelUrl: string | null = null,
	disabled: boolean = false
): ActionRowBuilder<ButtonBuilder>[] {
	const joinVoiceButton = voiceChannelUrl
		? new ButtonBuilder().setLabel('Join Maqraah').setStyle(ButtonStyle.Link).setURL(voiceChannelUrl).setDisabled(disabled)
		: new ButtonBuilder().setCustomId(`${REMINDER_CUSTOM_ID_PREFIX}:join-unconfigured:${sessionId}`).setLabel('Join Maqraah').setStyle(ButtonStyle.Secondary).setDisabled(true);

	const joiningShortlyButton = new ButtonBuilder()
		.setCustomId(buildReminderActionCustomId(reminderActions.JOINING_SHORTLY, sessionId))
		.setLabel("I'll join shortly")
		.setStyle(ButtonStyle.Danger)
		.setDisabled(disabled);

	return [new ActionRowBuilder<ButtonBuilder>().addComponents(joinVoiceButton, joiningShortlyButton)];
}

function isReminderAction(action: string | undefined): action is ReminderAction {
	return Object.values(reminderActions).includes(action as ReminderAction);
}
