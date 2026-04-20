import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { scheduleRepository } from '../../storage/sqlite';
import { normalizeScheduleName, scheduleStatuses, scheduleTypes } from '../../storage/sqlite/repositories/ScheduleRepository';
import type { Schedule } from '../../storage/sqlite/repositories/ScheduleRepository';
import { logger, DiscordContext } from '../../observability/logging/logger';
import { parseReminderTime } from '../../shared/time';
import { getScheduleDisplayContext } from './context';
import { buildScheduleListReply, buildScheduleSavedReply, buildScheduleShowReply, formatScheduleTiming } from './display';
import { formatUserMentions, parseMentionUserIds, parsePeopleMentions, serializeMentionUserIds } from './mentions';
import {
	isOneTimeScheduleDateTimeInFuture,
	isValidScheduleDate,
	parseWeekdayInput,
	serializeWeekdays,
} from './resolver';
import { scheduleGenericSchedules } from './scheduler';

const subcommands = {
	CREATE_RECURRING: 'create-recurring',
	CREATE_ONE_TIME: 'create-one-time',
	UPDATE: 'update',
	DELETE: 'delete',
	LIST: 'list',
	SHOW: 'show',
} as const;

const options = {
	NAME: 'name',
	NEW_NAME: 'new-name',
	DAYS: 'days',
	DATE: 'date',
	TIME: 'time',
	MESSAGE: 'message',
	PEOPLE: 'people',
} as const;

export const data = new SlashCommandBuilder()
	.setName('schedule')
	.setDescription('Manage generic reminders')
	.addSubcommand((subcommand) =>
		subcommand
			.setName(subcommands.CREATE_RECURRING)
			.setDescription('Create a recurring reminder')
			.addStringOption((option) => option.setName(options.NAME).setDescription('Schedule name').setRequired(true))
			.addStringOption((option) =>
				option
					.setName(options.DAYS)
					.setDescription('Days, comma-separated: monday, thursday')
					.setRequired(true)
			)
			.addStringOption((option) => option.setName(options.TIME).setDescription('Time of day, e.g. 7:30 PM').setRequired(true))
			.addStringOption((option) => option.setName(options.MESSAGE).setDescription('Reminder message').setRequired(true))
			.addStringOption((option) =>
				option
					.setName(options.PEOPLE)
					.setDescription('People to mention when this schedule fires, e.g. @user @user2')
					.setRequired(true)
			)
	)
	.addSubcommand((subcommand) =>
		subcommand
			.setName(subcommands.CREATE_ONE_TIME)
			.setDescription('Create a one-time reminder')
			.addStringOption((option) => option.setName(options.NAME).setDescription('Schedule name').setRequired(true))
			.addStringOption((option) => option.setName(options.DATE).setDescription('Date in YYYY-MM-DD').setRequired(true))
			.addStringOption((option) => option.setName(options.TIME).setDescription('Time of day, e.g. 7:30 PM').setRequired(true))
			.addStringOption((option) => option.setName(options.MESSAGE).setDescription('Reminder message').setRequired(true))
			.addStringOption((option) =>
				option
					.setName(options.PEOPLE)
					.setDescription('People to mention when this schedule fires, e.g. @user @user2')
					.setRequired(true)
			)
	)
	.addSubcommand((subcommand) =>
		subcommand
			.setName(subcommands.UPDATE)
			.setDescription('Update an existing reminder')
			.addStringOption((option) => option.setName(options.NAME).setDescription('Schedule name').setRequired(true))
			.addStringOption((option) => option.setName(options.NEW_NAME).setDescription('New schedule name'))
			.addStringOption((option) => option.setName(options.DAYS).setDescription('Recurring days, comma-separated: monday, thursday'))
			.addStringOption((option) => option.setName(options.DATE).setDescription('One-time date in YYYY-MM-DD'))
			.addStringOption((option) => option.setName(options.TIME).setDescription('Time of day, e.g. 7:30 PM'))
			.addStringOption((option) => option.setName(options.MESSAGE).setDescription('Reminder message'))
			.addStringOption((option) => option.setName(options.PEOPLE).setDescription('People to mention when this schedule fires, e.g. @user @user2'))
	)
	.addSubcommand((subcommand) =>
		subcommand
			.setName(subcommands.DELETE)
			.setDescription('Delete a reminder')
			.addStringOption((option) => option.setName(options.NAME).setDescription('Schedule name').setRequired(true))
	)
	.addSubcommand((subcommand) => subcommand.setName(subcommands.LIST).setDescription('List active reminders'))
	.addSubcommand((subcommand) =>
		subcommand
			.setName(subcommands.SHOW)
			.setDescription('Show a reminder')
			.addStringOption((option) => option.setName(options.NAME).setDescription('Schedule name').setRequired(true))
	);

export async function execute(interaction: any): Promise<void> {
	const subcommand = interaction.options.getSubcommand();
	const discordContext: DiscordContext = {
		userId: interaction.user.id,
		username: interaction.user.username,
		guildId: interaction.guildId?.toString(),
		channelId: interaction.channelId?.toString(),
		commandName: 'schedule',
		subcommand,
	};

	logger.info(`Executing schedule subcommand: ${subcommand}`, discordContext, { operationType: 'schedule_command' });

	try {
		switch (subcommand) {
			case subcommands.CREATE_RECURRING:
				await handleCreateRecurring(interaction, discordContext);
				return;
			case subcommands.CREATE_ONE_TIME:
				await handleCreateOneTime(interaction, discordContext);
				return;
			case subcommands.UPDATE:
				await handleUpdate(interaction, discordContext);
				return;
			case subcommands.DELETE:
				await handleDelete(interaction, discordContext);
				return;
			case subcommands.LIST:
				await handleList(interaction, discordContext);
				return;
			case subcommands.SHOW:
				await handleShow(interaction, discordContext);
				return;
			default:
				await interaction.reply({ content: 'Unknown schedule command.', flags: MessageFlags.Ephemeral });
		}
	} catch (error) {
		logger.error(`Error executing schedule subcommand: ${subcommand}`, error as Error, discordContext, {
			operationType: 'schedule_command',
			operationStatus: 'failure',
		});
		await interaction.reply({
			content: isUniqueNameError(error) ? 'A schedule with that name already exists.' : 'There was an error executing this command!',
			flags: MessageFlags.Ephemeral,
		});
	}
}

async function handleCreateRecurring(interaction: any, discordContext: DiscordContext): Promise<void> {
	const name = normalizeScheduleName(interaction.options.getString(options.NAME) ?? '');
	const weekdays = getSelectedWeekdays(interaction);
	const parsedTime = parseReminderTime(interaction.options.getString(options.TIME));
	const message = (interaction.options.getString(options.MESSAGE) ?? '').trim();
	const people = parsePeopleMentions(interaction.options.getString(options.PEOPLE), true);

	if (!name) {
		await interaction.reply({ content: 'Schedule name cannot be empty.', flags: MessageFlags.Ephemeral });
		return;
	}

	if (!weekdays) {
		await interaction.reply({
			content: 'Invalid days. Use full weekday names separated by commas, such as `monday` or `monday, thursday`.',
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	if (!parsedTime) {
		await interaction.reply({ content: 'Invalid time. Please use `H:MM AM/PM`, such as `7:30 PM`.', flags: MessageFlags.Ephemeral });
		return;
	}

	if (!message) {
		await interaction.reply({ content: 'Schedule message cannot be empty.', flags: MessageFlags.Ephemeral });
		return;
	}

	if (!people.valid) {
		await interaction.reply({ content: 'Invalid people list. Please mention Discord users like `@user @user2`.', flags: MessageFlags.Ephemeral });
		return;
	}

	const schedule = await scheduleRepository.createSchedule({
		name,
		type: scheduleTypes.RECURRING,
		weekdays: serializeWeekdays(weekdays),
		oneTimeDate: null,
		time: parsedTime.displayTime,
		message,
		mentionUserIds: serializeMentionUserIds(people.userIds),
		creatorUserId: interaction.user.id,
	});

	await scheduleGenericSchedules(interaction.client);
	const context = await getScheduleDisplayContext(interaction);
	const notificationWarning = await sendScheduleCreationNotification(interaction, schedule, discordContext);
	const warnings = notificationWarning ? [...context.warnings, notificationWarning] : context.warnings;
	logger.info('Recurring schedule created', discordContext, {
		operationType: 'schedule_save',
		operationStatus: 'success',
		additionalData: { scheduleId: schedule.id, scheduleName: schedule.name },
	});
	await interaction.reply(buildScheduleSavedReply({ schedule, timezone: context.timezone, warnings, title: 'Recurring Schedule Created' }));
}

async function handleCreateOneTime(interaction: any, discordContext: DiscordContext): Promise<void> {
	const name = normalizeScheduleName(interaction.options.getString(options.NAME) ?? '');
	const date = (interaction.options.getString(options.DATE) ?? '').trim();
	const parsedTime = parseReminderTime(interaction.options.getString(options.TIME));
	const message = (interaction.options.getString(options.MESSAGE) ?? '').trim();
	const people = parsePeopleMentions(interaction.options.getString(options.PEOPLE), true);

	if (!name) {
		await interaction.reply({ content: 'Schedule name cannot be empty.', flags: MessageFlags.Ephemeral });
		return;
	}

	if (!isValidScheduleDate(date)) {
		await interaction.reply({ content: 'Invalid date. Please use `YYYY-MM-DD`, such as `2026-04-20`.', flags: MessageFlags.Ephemeral });
		return;
	}

	if (!parsedTime) {
		await interaction.reply({ content: 'Invalid time. Please use `H:MM AM/PM`, such as `7:30 PM`.', flags: MessageFlags.Ephemeral });
		return;
	}

	if (!message) {
		await interaction.reply({ content: 'Schedule message cannot be empty.', flags: MessageFlags.Ephemeral });
		return;
	}

	if (!people.valid) {
		await interaction.reply({ content: 'Invalid people list. Please mention Discord users like `@user @user2`.', flags: MessageFlags.Ephemeral });
		return;
	}

	const context = await getScheduleDisplayContext(interaction);
	if (!context.timezone) {
		await interaction.reply({ content: 'Timezone is invalid. Please update configuration before creating schedules.', flags: MessageFlags.Ephemeral });
		return;
	}

	if (!isOneTimeScheduleDateTimeInFuture(date, parsedTime.displayTime, context.timezone)) {
		await interaction.reply({ content: 'One-time schedules must be set for a future date and time.', flags: MessageFlags.Ephemeral });
		return;
	}

	const schedule = await scheduleRepository.createSchedule({
		name,
		type: scheduleTypes.ONE_TIME,
		weekdays: null,
		oneTimeDate: date,
		time: parsedTime.displayTime,
		message,
		mentionUserIds: serializeMentionUserIds(people.userIds),
		creatorUserId: interaction.user.id,
	});

	await scheduleGenericSchedules(interaction.client);
	const notificationWarning = await sendScheduleCreationNotification(interaction, schedule, discordContext);
	const warnings = notificationWarning ? [...context.warnings, notificationWarning] : context.warnings;
	logger.info('One-time schedule created', discordContext, {
		operationType: 'schedule_save',
		operationStatus: 'success',
		additionalData: { scheduleId: schedule.id, scheduleName: schedule.name },
	});
	await interaction.reply(buildScheduleSavedReply({ schedule, timezone: context.timezone, warnings, title: 'One-Time Schedule Created' }));
}

async function handleUpdate(interaction: any, discordContext: DiscordContext): Promise<void> {
	const name = interaction.options.getString(options.NAME);
	const schedule = name ? await scheduleRepository.getScheduleByName(name) : null;
	if (!schedule) {
		await interaction.reply({ content: 'Schedule not found.', flags: MessageFlags.Ephemeral });
		return;
	}

	const updates: any = {};
	const newName = interaction.options.getString(options.NEW_NAME);
	if (newName !== null) {
		const normalizedName = normalizeScheduleName(newName);
		if (!normalizedName) {
			await interaction.reply({ content: 'New schedule name cannot be empty.', flags: MessageFlags.Ephemeral });
			return;
		}
		updates.name = normalizedName;
	}

	const time = interaction.options.getString(options.TIME);
	if (time !== null) {
		const parsedTime = parseReminderTime(time);
		if (!parsedTime) {
			await interaction.reply({ content: 'Invalid time. Please use `H:MM AM/PM`, such as `7:30 PM`.', flags: MessageFlags.Ephemeral });
			return;
		}
		updates.time = parsedTime.displayTime;
	}

	const message = interaction.options.getString(options.MESSAGE);
	if (message !== null) {
		const trimmedMessage = message.trim();
		if (!trimmedMessage) {
			await interaction.reply({ content: 'Schedule message cannot be empty.', flags: MessageFlags.Ephemeral });
			return;
		}
		updates.message = trimmedMessage;
	}

	const people = interaction.options.getString(options.PEOPLE);
	if (people !== null) {
		const parsedPeople = parsePeopleMentions(people, true);
		if (!parsedPeople.valid) {
			await interaction.reply({ content: 'Invalid people list. Please mention Discord users like `@user @user2`.', flags: MessageFlags.Ephemeral });
			return;
		}
		updates.mentionUserIds = serializeMentionUserIds(parsedPeople.userIds);
	}

	const days = interaction.options.getString(options.DAYS);
	if (days !== null) {
		if (schedule.type === scheduleTypes.ONE_TIME) {
			await interaction.reply({ content: 'Days can only be updated for recurring schedules.', flags: MessageFlags.Ephemeral });
			return;
		}
		const weekdays = parseWeekdayInput(days);
		if (!weekdays) {
			await interaction.reply({
				content: 'Invalid days. Use full weekday names separated by commas, such as `monday` or `monday, thursday`.',
				flags: MessageFlags.Ephemeral,
			});
			return;
		}
		updates.weekdays = serializeWeekdays(weekdays);
	}

	const date = interaction.options.getString(options.DATE);
	if (date !== null) {
		if (schedule.type === scheduleTypes.RECURRING) {
			await interaction.reply({ content: 'Date can only be updated for one-time schedules.', flags: MessageFlags.Ephemeral });
			return;
		}
		if (!isValidScheduleDate(date)) {
			await interaction.reply({ content: 'Invalid date. Please use `YYYY-MM-DD`, such as `2026-04-20`.', flags: MessageFlags.Ephemeral });
			return;
		}
		updates.oneTimeDate = date;
	}

	const context = await getScheduleDisplayContext(interaction);
	if (!context.timezone) {
		await interaction.reply({ content: 'Timezone is invalid. Please update configuration before updating schedules.', flags: MessageFlags.Ephemeral });
		return;
	}

	if (schedule.type === scheduleTypes.ONE_TIME && (updates.oneTimeDate !== undefined || updates.time !== undefined)) {
		const nextDate = (updates.oneTimeDate as string | undefined) ?? schedule.oneTimeDate;
		const nextTime = (updates.time as string | undefined) ?? schedule.time;
		if (!nextDate || !isOneTimeScheduleDateTimeInFuture(nextDate, nextTime, context.timezone)) {
			await interaction.reply({ content: 'One-time schedules must be set for a future date and time.', flags: MessageFlags.Ephemeral });
			return;
		}
	}

	if (Object.keys(updates).length === 0) {
		await interaction.reply({ content: 'No options provided.', flags: MessageFlags.Ephemeral });
		return;
	}

	updates.status = scheduleStatuses.ACTIVE;
	const updatedSchedule = await scheduleRepository.updateScheduleById(schedule.id, updates);
	if (!updatedSchedule) {
		await interaction.reply({ content: 'Schedule not found.', flags: MessageFlags.Ephemeral });
		return;
	}

	await scheduleGenericSchedules(interaction.client);
	logger.info('Schedule updated', discordContext, {
		operationType: 'schedule_save',
		operationStatus: 'success',
		additionalData: { scheduleId: updatedSchedule.id, scheduleName: updatedSchedule.name },
	});
	await interaction.reply(buildScheduleSavedReply({ schedule: updatedSchedule, timezone: context.timezone, warnings: context.warnings, title: 'Schedule Updated' }));
}

async function handleDelete(interaction: any, discordContext: DiscordContext): Promise<void> {
	const name = interaction.options.getString(options.NAME);
	if (!name) {
		await interaction.reply({ content: 'Schedule name is required.', flags: MessageFlags.Ephemeral });
		return;
	}

	const deleted = await scheduleRepository.deleteScheduleByName(name);
	if (!deleted) {
		await interaction.reply({ content: 'Schedule not found.', flags: MessageFlags.Ephemeral });
		return;
	}

	await scheduleGenericSchedules(interaction.client);
	logger.info('Schedule deleted', discordContext, { operationType: 'schedule_delete', operationStatus: 'success', additionalData: { name } });
	await interaction.reply({ content: `Deleted schedule \`${name}\`.`, flags: MessageFlags.Ephemeral });
}

async function handleList(interaction: any, discordContext: DiscordContext): Promise<void> {
	const [schedules, context] = await Promise.all([scheduleRepository.getActiveSchedules(), getScheduleDisplayContext(interaction)]);

	logger.info('Listing active schedules', discordContext, {
		operationType: 'schedule_list',
		operationStatus: 'success',
		additionalData: { count: schedules.length },
	});
	await interaction.reply(buildScheduleListReply({ schedules, timezone: context.timezone, warnings: context.warnings }));
}

async function handleShow(interaction: any, discordContext: DiscordContext): Promise<void> {
	const name = interaction.options.getString(options.NAME);
	const schedule = name ? await scheduleRepository.getScheduleByName(name) : null;
	if (!schedule) {
		await interaction.reply({ content: 'Schedule not found.', flags: MessageFlags.Ephemeral });
		return;
	}

	const context = await getScheduleDisplayContext(interaction);
	logger.info('Showing schedule', discordContext, {
		operationType: 'schedule_show',
		operationStatus: 'success',
		additionalData: { scheduleId: schedule.id, scheduleName: schedule.name },
	});
	await interaction.reply(buildScheduleShowReply({ schedule, timezone: context.timezone, warnings: context.warnings }));
}

function isUniqueNameError(error: unknown): boolean {
	return error instanceof Error && /UNIQUE constraint failed|SQLITE_CONSTRAINT/i.test(error.message);
}

function getSelectedWeekdays(interaction: any): number[] | null {
	return parseWeekdayInput(interaction.options.getString(options.DAYS));
}

async function sendScheduleCreationNotification(
	interaction: any,
	schedule: Schedule,
	discordContext: DiscordContext
): Promise<string | null> {
	const userIds = parseMentionUserIds(schedule.mentionUserIds);
	if (userIds.length === 0) {
		return null;
	}

	const channelId = process.env.CHANNEL_ID;
	if (!channelId) {
		return 'People were not notified because the reminder channel is not configured.';
	}

	const channel = interaction.client?.channels?.cache?.get(channelId) ?? interaction.guild?.channels?.cache?.get(channelId);
	if (!channel || typeof channel.send !== 'function') {
		return `People were not notified because configured reminder channel ${channelId} is not sendable.`;
	}

	try {
		await channel.send({
			content: buildScheduleCreationNotification(schedule),
			allowedMentions: { users: userIds },
		});
		logger.info('Schedule creation notification sent', discordContext, {
			operationType: 'schedule_notification',
			operationStatus: 'success',
			additionalData: { scheduleId: schedule.id, scheduleName: schedule.name, userCount: userIds.length },
		});
		return null;
	} catch (error) {
		logger.error('Failed to send schedule creation notification', error as Error, discordContext, {
			operationType: 'schedule_notification',
			operationStatus: 'failure',
			additionalData: { scheduleId: schedule.id, scheduleName: schedule.name, userCount: userIds.length },
		});
		return 'People were not notified because Discord rejected the notification message.';
	}
}

function buildScheduleCreationNotification(schedule: Schedule): string {
	const mentions = formatUserMentions(schedule.mentionUserIds);
	return `${mentions}\nA schedule was created: **${schedule.name}** - ${formatScheduleTiming(schedule)}.`;
}
