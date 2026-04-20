import {
	ActionRowBuilder,
	ModalBuilder,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
	TextInputBuilder,
	TextInputStyle,
} from 'discord.js';
import type { Schedule } from '../../storage/sqlite/repositories/ScheduleRepository';
import { weekdayOptions } from './resolver';

export const scheduleCustomIdPrefixes = {
	WEEKDAY_SELECT: 'schedule:weekday:',
	RECURRING_MODAL: 'schedule:modal:recurring:',
	ONE_TIME_MODAL: 'schedule:modal:one-time:',
} as const;

export const scheduleModalInputs = {
	NAME: 'name',
	DATE: 'date',
	TIME: 'time',
	MESSAGE: 'message',
} as const;

export function buildWeekdaySelectPayload(token: string, selectedWeekdays: number[] = []) {
	const selectMenu = new StringSelectMenuBuilder()
		.setCustomId(buildWeekdaySelectCustomId(token))
		.setPlaceholder('Choose schedule days')
		.setMinValues(1)
		.setMaxValues(weekdayOptions.length)
		.addOptions(
			weekdayOptions.map((weekday) =>
				new StringSelectMenuOptionBuilder()
					.setLabel(weekday.label)
					.setValue(weekday.key)
					.setDefault(selectedWeekdays.includes(weekday.value))
			)
		);

	return {
		content: 'Choose one or more days for this recurring schedule.',
		components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu)],
		ephemeral: true,
	};
}

export function buildRecurringScheduleModal(token: string, schedule?: Schedule): ModalBuilder {
	const modal = new ModalBuilder().setCustomId(buildRecurringModalCustomId(token)).setTitle(schedule ? 'Update recurring schedule' : 'Create recurring schedule');

	modal.addComponents(
		buildTextInputRow(
			new TextInputBuilder()
				.setCustomId(scheduleModalInputs.NAME)
				.setLabel('Schedule name')
				.setStyle(TextInputStyle.Short)
				.setRequired(true)
				.setMaxLength(80)
				.setPlaceholder('Team meeting'),
			schedule?.name
		),
		buildTextInputRow(
			new TextInputBuilder()
				.setCustomId(scheduleModalInputs.TIME)
				.setLabel('Time of day')
				.setStyle(TextInputStyle.Short)
				.setRequired(true)
				.setMaxLength(20)
				.setPlaceholder('7:30 PM'),
			schedule?.time
		),
		buildTextInputRow(
			new TextInputBuilder()
				.setCustomId(scheduleModalInputs.MESSAGE)
				.setLabel('Reminder message')
				.setStyle(TextInputStyle.Paragraph)
				.setRequired(true)
				.setMaxLength(1900)
				.setPlaceholder('Reminder: team meeting starts soon.'),
			schedule?.message
		)
	);

	return modal;
}

export function buildOneTimeScheduleModal(token: string, schedule?: Schedule): ModalBuilder {
	const modal = new ModalBuilder().setCustomId(buildOneTimeModalCustomId(token)).setTitle(schedule ? 'Update one-time schedule' : 'Create one-time schedule');

	modal.addComponents(
		buildTextInputRow(
			new TextInputBuilder()
				.setCustomId(scheduleModalInputs.NAME)
				.setLabel('Schedule name')
				.setStyle(TextInputStyle.Short)
				.setRequired(true)
				.setMaxLength(80)
				.setPlaceholder('Doctor appointment'),
			schedule?.name
		),
		buildTextInputRow(
			new TextInputBuilder()
				.setCustomId(scheduleModalInputs.DATE)
				.setLabel('Date')
				.setStyle(TextInputStyle.Short)
				.setRequired(true)
				.setMaxLength(10)
				.setPlaceholder('2026-04-20'),
			schedule?.oneTimeDate ?? undefined
		),
		buildTextInputRow(
			new TextInputBuilder()
				.setCustomId(scheduleModalInputs.TIME)
				.setLabel('Time of day')
				.setStyle(TextInputStyle.Short)
				.setRequired(true)
				.setMaxLength(20)
				.setPlaceholder('7:30 PM'),
			schedule?.time
		),
		buildTextInputRow(
			new TextInputBuilder()
				.setCustomId(scheduleModalInputs.MESSAGE)
				.setLabel('Reminder message')
				.setStyle(TextInputStyle.Paragraph)
				.setRequired(true)
				.setMaxLength(1900)
				.setPlaceholder('Reminder: appointment starts soon.'),
			schedule?.message
		)
	);

	return modal;
}

export function buildWeekdaySelectCustomId(token: string): string {
	return `${scheduleCustomIdPrefixes.WEEKDAY_SELECT}${token}`;
}

export function buildRecurringModalCustomId(token: string): string {
	return `${scheduleCustomIdPrefixes.RECURRING_MODAL}${token}`;
}

export function buildOneTimeModalCustomId(token: string): string {
	return `${scheduleCustomIdPrefixes.ONE_TIME_MODAL}${token}`;
}

export function parseScheduleCustomId(customId: string): { kind: 'weekday' | 'recurring_modal' | 'one_time_modal'; token: string } | null {
	if (customId.startsWith(scheduleCustomIdPrefixes.WEEKDAY_SELECT)) {
		return { kind: 'weekday', token: customId.slice(scheduleCustomIdPrefixes.WEEKDAY_SELECT.length) };
	}

	if (customId.startsWith(scheduleCustomIdPrefixes.RECURRING_MODAL)) {
		return { kind: 'recurring_modal', token: customId.slice(scheduleCustomIdPrefixes.RECURRING_MODAL.length) };
	}

	if (customId.startsWith(scheduleCustomIdPrefixes.ONE_TIME_MODAL)) {
		return { kind: 'one_time_modal', token: customId.slice(scheduleCustomIdPrefixes.ONE_TIME_MODAL.length) };
	}

	return null;
}

function buildTextInputRow(input: TextInputBuilder, value?: string): ActionRowBuilder<TextInputBuilder> {
	if (value) {
		input.setValue(value);
	}

	return new ActionRowBuilder<TextInputBuilder>().addComponents(input);
}
