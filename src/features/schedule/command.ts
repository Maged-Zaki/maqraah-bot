import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { scheduleRepository } from '../../storage/sqlite';
import { scheduleTypes } from '../../storage/sqlite/repositories/ScheduleRepository';
import { logger, DiscordContext } from '../../observability/logging/logger';
import { buildOneTimeScheduleModal, buildWeekdaySelectPayload } from './components';
import { getScheduleDisplayContext } from './context';
import { buildScheduleListReply, buildScheduleShowReply } from './display';
import { parseStoredWeekdays } from './resolver';
import { scheduleGenericSchedules } from './scheduler';
import { createPendingScheduleSetup, scheduleSetupActions } from './state';

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
} as const;

export const data = new SlashCommandBuilder()
	.setName('schedule')
	.setDescription('Manage generic reminders')
	.addSubcommand((subcommand) => subcommand.setName(subcommands.CREATE_RECURRING).setDescription('Create a recurring reminder'))
	.addSubcommand((subcommand) => subcommand.setName(subcommands.CREATE_ONE_TIME).setDescription('Create a one-time reminder'))
	.addSubcommand((subcommand) =>
		subcommand
			.setName(subcommands.UPDATE)
			.setDescription('Update an existing reminder')
			.addStringOption((option) => option.setName(options.NAME).setDescription('Schedule name').setRequired(true))
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
		await interaction.reply({ content: 'There was an error executing this command!', flags: MessageFlags.Ephemeral });
	}
}

async function handleCreateRecurring(interaction: any, discordContext: DiscordContext): Promise<void> {
	const token = createPendingScheduleSetup({
		action: scheduleSetupActions.CREATE_RECURRING,
		userId: interaction.user.id,
	});

	logger.info('Opening recurring schedule weekday picker', discordContext, { operationType: 'schedule_form' });
	await interaction.reply(buildWeekdaySelectPayload(token));
}

async function handleCreateOneTime(interaction: any, discordContext: DiscordContext): Promise<void> {
	const token = createPendingScheduleSetup({
		action: scheduleSetupActions.CREATE_ONE_TIME,
		userId: interaction.user.id,
	});

	logger.info('Opening one-time schedule modal', discordContext, { operationType: 'schedule_form' });
	await interaction.showModal(buildOneTimeScheduleModal(token));
}

async function handleUpdate(interaction: any, discordContext: DiscordContext): Promise<void> {
	const name = interaction.options.getString(options.NAME);
	const schedule = name ? await scheduleRepository.getScheduleByName(name) : null;
	if (!schedule) {
		await interaction.reply({ content: 'Schedule not found.', flags: MessageFlags.Ephemeral });
		return;
	}

	if (schedule.type === scheduleTypes.ONE_TIME) {
		const token = createPendingScheduleSetup({
			action: scheduleSetupActions.UPDATE_ONE_TIME,
			userId: interaction.user.id,
			scheduleId: schedule.id,
		});
		await interaction.showModal(buildOneTimeScheduleModal(token, schedule));
		return;
	}

	const token = createPendingScheduleSetup({
		action: scheduleSetupActions.UPDATE_RECURRING,
		userId: interaction.user.id,
		scheduleId: schedule.id,
		weekdays: parseStoredWeekdays(schedule.weekdays),
	});

	logger.info('Opening recurring schedule weekday picker for update', discordContext, {
		operationType: 'schedule_form',
		additionalData: { scheduleId: schedule.id, scheduleName: schedule.name },
	});
	await interaction.reply(buildWeekdaySelectPayload(token, parseStoredWeekdays(schedule.weekdays)));
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
