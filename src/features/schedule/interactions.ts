import { MessageFlags } from 'discord.js';
import { scheduleRepository } from '../../storage/sqlite';
import { scheduleStatuses, scheduleTypes } from '../../storage/sqlite/repositories/ScheduleRepository';
import { normalizeScheduleName } from '../../storage/sqlite/repositories/ScheduleRepository';
import { logger, DiscordContext } from '../../observability/logging/logger';
import { parseReminderTime } from '../../shared/time';
import {
	buildOneTimeScheduleModal,
	buildRecurringScheduleModal,
	parseScheduleCustomId,
	scheduleModalInputs,
} from './components';
import { getScheduleDisplayContext } from './context';
import { buildScheduleSavedReply } from './display';
import { isValidScheduleDate, parseWeekdayValues, serializeWeekdays } from './resolver';
import { scheduleGenericSchedules } from './scheduler';
import {
	consumePendingScheduleSetup,
	getPendingScheduleSetup,
	scheduleSetupActions,
	updatePendingScheduleSetup,
} from './state';

interface ScheduleFormValues {
	name: string;
	date?: string;
	time: string;
	message: string;
}

export async function handleScheduleSelectMenuInteraction(interaction: any): Promise<boolean> {
	const parsedCustomId = parseScheduleCustomId(interaction.customId);
	if (!parsedCustomId || parsedCustomId.kind !== 'weekday') {
		return false;
	}

	const discordContext = buildDiscordContext(interaction, 'weekday-select');
	const setup = getPendingScheduleSetup(parsedCustomId.token, interaction.user.id);
	if (!setup || (setup.action !== scheduleSetupActions.CREATE_RECURRING && setup.action !== scheduleSetupActions.UPDATE_RECURRING)) {
		await interaction.reply({ content: 'This schedule setup expired. Please run the command again.', flags: MessageFlags.Ephemeral });
		return true;
	}

	const weekdays = parseWeekdayValues(interaction.values ?? []);
	if (!weekdays) {
		await interaction.reply({ content: 'Please choose at least one valid weekday.', flags: MessageFlags.Ephemeral });
		return true;
	}

	updatePendingScheduleSetup(parsedCustomId.token, { weekdays });

	const schedule = setup.scheduleId ? await scheduleRepository.getScheduleById(setup.scheduleId) : undefined;
	logger.info('Opening recurring schedule modal', discordContext, {
		operationType: 'schedule_form',
		additionalData: { action: setup.action, weekdays },
	});

	await interaction.showModal(buildRecurringScheduleModal(parsedCustomId.token, schedule ?? undefined));
	return true;
}

export async function handleScheduleModalSubmit(interaction: any): Promise<boolean> {
	const parsedCustomId = parseScheduleCustomId(interaction.customId);
	if (!parsedCustomId || (parsedCustomId.kind !== 'recurring_modal' && parsedCustomId.kind !== 'one_time_modal')) {
		return false;
	}

	const setup = consumePendingScheduleSetup(parsedCustomId.token, interaction.user.id);
	if (!setup) {
		await interaction.reply({ content: 'This schedule setup expired. Please run the command again.', flags: MessageFlags.Ephemeral });
		return true;
	}

	const discordContext = buildDiscordContext(interaction, parsedCustomId.kind);
	try {
		if (parsedCustomId.kind === 'recurring_modal') {
			await handleRecurringModalSubmit(interaction, setup, discordContext);
		} else {
			await handleOneTimeModalSubmit(interaction, setup, discordContext);
		}
	} catch (error) {
		logger.error('Failed to handle schedule modal submission', error as Error, discordContext, {
			operationType: 'schedule_form',
			operationStatus: 'failure',
		});

		await interaction.reply({
			content: isUniqueNameError(error) ? 'A schedule with that name already exists.' : 'There was an error saving this schedule.',
			flags: MessageFlags.Ephemeral,
		});
	}

	return true;
}

async function handleRecurringModalSubmit(interaction: any, setup: ReturnType<typeof consumePendingScheduleSetup>, discordContext: DiscordContext): Promise<void> {
	if (!setup || !setup.weekdays || setup.weekdays.length === 0) {
		await interaction.reply({ content: 'Please choose at least one weekday before submitting the form.', flags: MessageFlags.Ephemeral });
		return;
	}

	const values = await readRecurringForm(interaction);
	if (!values) {
		return;
	}

	const schedule =
		setup.action === scheduleSetupActions.UPDATE_RECURRING && setup.scheduleId
			? await scheduleRepository.updateScheduleById(setup.scheduleId, {
					name: values.name,
					weekdays: serializeWeekdays(setup.weekdays),
					oneTimeDate: null,
					time: values.time,
					message: values.message,
					status: scheduleStatuses.ACTIVE,
				})
			: await scheduleRepository.createSchedule({
					name: values.name,
					type: scheduleTypes.RECURRING,
					weekdays: serializeWeekdays(setup.weekdays),
					oneTimeDate: null,
					time: values.time,
					message: values.message,
					creatorUserId: interaction.user.id,
				});

	if (!schedule) {
		await interaction.reply({ content: 'Schedule not found.', flags: MessageFlags.Ephemeral });
		return;
	}

	await scheduleGenericSchedules(interaction.client);
	const context = await getScheduleDisplayContext(interaction);
	logger.info('Recurring schedule saved', discordContext, {
		operationType: 'schedule_save',
		operationStatus: 'success',
		additionalData: { scheduleId: schedule.id, scheduleName: schedule.name },
	});
	await interaction.reply(
		buildScheduleSavedReply({
			schedule,
			timezone: context.timezone,
			warnings: context.warnings,
			title: setup.action === scheduleSetupActions.UPDATE_RECURRING ? 'Recurring Schedule Updated' : 'Recurring Schedule Created',
		})
	);
}

async function handleOneTimeModalSubmit(interaction: any, setup: ReturnType<typeof consumePendingScheduleSetup>, discordContext: DiscordContext): Promise<void> {
	if (!setup) {
		await interaction.reply({ content: 'This schedule setup expired. Please run the command again.', flags: MessageFlags.Ephemeral });
		return;
	}

	const values = await readOneTimeForm(interaction);
	if (!values) {
		return;
	}

	const schedule =
		setup.action === scheduleSetupActions.UPDATE_ONE_TIME && setup.scheduleId
			? await scheduleRepository.updateScheduleById(setup.scheduleId, {
					name: values.name,
					weekdays: null,
					oneTimeDate: values.date,
					time: values.time,
					message: values.message,
					status: scheduleStatuses.ACTIVE,
				})
			: await scheduleRepository.createSchedule({
					name: values.name,
					type: scheduleTypes.ONE_TIME,
					weekdays: null,
					oneTimeDate: values.date,
					time: values.time,
					message: values.message,
					creatorUserId: interaction.user.id,
				});

	if (!schedule) {
		await interaction.reply({ content: 'Schedule not found.', flags: MessageFlags.Ephemeral });
		return;
	}

	await scheduleGenericSchedules(interaction.client);
	const context = await getScheduleDisplayContext(interaction);
	logger.info('One-time schedule saved', discordContext, {
		operationType: 'schedule_save',
		operationStatus: 'success',
		additionalData: { scheduleId: schedule.id, scheduleName: schedule.name },
	});
	await interaction.reply(
		buildScheduleSavedReply({
			schedule,
			timezone: context.timezone,
			warnings: context.warnings,
			title: setup.action === scheduleSetupActions.UPDATE_ONE_TIME ? 'One-Time Schedule Updated' : 'One-Time Schedule Created',
		})
	);
}

async function readRecurringForm(interaction: any): Promise<ScheduleFormValues | null> {
	const name = normalizeScheduleName(interaction.fields.getTextInputValue(scheduleModalInputs.NAME));
	const parsedTime = parseReminderTime(interaction.fields.getTextInputValue(scheduleModalInputs.TIME));
	const message = interaction.fields.getTextInputValue(scheduleModalInputs.MESSAGE).trim();

	if (!name) {
		await interaction.reply({ content: 'Schedule name cannot be empty.', flags: MessageFlags.Ephemeral });
		return null;
	}

	if (!parsedTime) {
		await interaction.reply({ content: 'Invalid time. Please use `H:MM AM/PM`, such as `7:30 PM`.', flags: MessageFlags.Ephemeral });
		return null;
	}

	if (!message) {
		await interaction.reply({ content: 'Schedule message cannot be empty.', flags: MessageFlags.Ephemeral });
		return null;
	}

	return {
		name,
		time: parsedTime.displayTime,
		message,
	};
}

async function readOneTimeForm(interaction: any): Promise<ScheduleFormValues | null> {
	const name = normalizeScheduleName(interaction.fields.getTextInputValue(scheduleModalInputs.NAME));
	const date = interaction.fields.getTextInputValue(scheduleModalInputs.DATE).trim();
	const parsedTime = parseReminderTime(interaction.fields.getTextInputValue(scheduleModalInputs.TIME));
	const message = interaction.fields.getTextInputValue(scheduleModalInputs.MESSAGE).trim();

	if (!name) {
		await interaction.reply({ content: 'Schedule name cannot be empty.', flags: MessageFlags.Ephemeral });
		return null;
	}

	if (!isValidScheduleDate(date)) {
		await interaction.reply({ content: 'Invalid date. Please use `YYYY-MM-DD`, such as `2026-04-20`.', flags: MessageFlags.Ephemeral });
		return null;
	}

	if (!parsedTime) {
		await interaction.reply({ content: 'Invalid time. Please use `H:MM AM/PM`, such as `7:30 PM`.', flags: MessageFlags.Ephemeral });
		return null;
	}

	if (!message) {
		await interaction.reply({ content: 'Schedule message cannot be empty.', flags: MessageFlags.Ephemeral });
		return null;
	}

	return {
		name,
		date,
		time: parsedTime.displayTime,
		message,
	};
}

function isUniqueNameError(error: unknown): boolean {
	return error instanceof Error && /UNIQUE constraint failed|SQLITE_CONSTRAINT/i.test(error.message);
}

function buildDiscordContext(interaction: any, subcommand: string): DiscordContext {
	return {
		userId: interaction.user.id,
		username: interaction.user.username,
		guildId: interaction.guildId?.toString(),
		channelId: interaction.channelId?.toString(),
		commandName: 'schedule',
		subcommand,
	};
}
