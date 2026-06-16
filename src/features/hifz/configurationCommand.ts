import { EmbedBuilder, MessageFlags, SlashCommandSubcommandGroupBuilder } from 'discord.js';
import { configurationRepository } from '../../storage/sqlite';
import { logger, DiscordContext } from '../../observability/logging/logger';
import { parseReminderTime } from '../../shared/time';
import type { PrayerName } from '../../shared/prayers';
import { getPrayerSyncOffsetMinutes, isPrayerSyncEnabled } from '../../shared/prayerSync/timings';
import { defaultHifzCadence, getHifzReminderOffset, isHifzReminderStageEnabled } from './reminders/cadence';
import {
	DEFAULT_HIFZ_TIME_SYNC_OFFSET_MINUTES,
	resolveHifzTimeSyncPrayer,
	scheduleHifzTimeSync,
	syncHifzTimeFromPrayer,
} from './reminders/hifzTimeSync';
import { scheduleHifzReminder } from './reminders/scheduler';
import { DEFAULT_HIFZ_TIME } from './reminders/sessionId';
import { resolveHifzRoleId } from './role';

export const hifzConfigurationGroup = 'configuration';

const subcommands = {
	UPDATE: 'update',
	SHOW: 'show',
} as const;

const options = {
	HIFZ_ENABLED: 'hifz-enabled',
	HIFZ_ROLE: 'hifz-role',
	HIFZ_TIME: 'hifz-time',
	HIFZ_REMINDER_ENABLED: 'hifz-reminder-enabled',
	HIFZ_PRE_REMINDER_ENABLED: 'hifz-pre-reminder-enabled',
	HIFZ_PRE_REMINDER_MINUTES: 'hifz-pre-reminder-minutes',
	HIFZ_TIME_SYNC_ENABLED: 'hifz-time-sync-enabled',
	HIFZ_TIME_SYNC_PRAYER: 'hifz-time-sync-prayer',
	HIFZ_MINUTES_AFTER_PRAYER: 'hifz-minutes-after-prayer',
} as const;

const prayerChoices: Array<{ name: string; value: PrayerName }> = [
	{ name: 'Fajr', value: 'fajr' },
	{ name: 'Sunrise', value: 'sunrise' },
	{ name: 'Dhuhr', value: 'dhuhr' },
	{ name: 'Asr', value: 'asr' },
	{ name: 'Maghrib', value: 'maghrib' },
	{ name: 'Isha', value: 'isha' },
];

export function addHifzConfigurationSubcommands(group: SlashCommandSubcommandGroupBuilder): SlashCommandSubcommandGroupBuilder {
	group
		.addSubcommand((subcommand) =>
			subcommand
				.setName(subcommands.UPDATE)
				.setDescription('Update hifz (memorization) configuration')
				.addBooleanOption((option) => option.setName(options.HIFZ_ENABLED).setDescription('Enable or disable the entire hifz feature'))
				.addRoleOption((option) => option.setName(options.HIFZ_ROLE).setDescription('Role to ping for hifz reminders'))
				.addStringOption((option) => option.setName(options.HIFZ_TIME).setDescription('Hifz reminder time (e.g., 6:00 PM)'))
				.addBooleanOption((option) => option.setName(options.HIFZ_REMINDER_ENABLED).setDescription('Enable the hifz reminder stage'))
				.addBooleanOption((option) => option.setName(options.HIFZ_PRE_REMINDER_ENABLED).setDescription('Enable the hifz pre-reminder stage'))
				.addIntegerOption((option) =>
					option.setName(options.HIFZ_PRE_REMINDER_MINUTES).setDescription('Minutes before hifz to send the pre-reminder').setMinValue(0)
				)
				.addBooleanOption((option) =>
					option.setName(options.HIFZ_TIME_SYNC_ENABLED).setDescription('Automatically adjust the hifz time from a prayer time')
				)
				.addStringOption((option) =>
					option
						.setName(options.HIFZ_TIME_SYNC_PRAYER)
						.setDescription('Prayer to sync the hifz time to')
						.addChoices(...prayerChoices)
				)
				.addIntegerOption((option) =>
					option.setName(options.HIFZ_MINUTES_AFTER_PRAYER).setDescription('Minutes after the prayer for the hifz time').setMinValue(0)
				)
		)
		.addSubcommand((subcommand) => subcommand.setName(subcommands.SHOW).setDescription('Display current hifz configuration'));
	return group;
}

export async function handleHifzConfigurationCommand(interaction: any): Promise<void> {
	const subcommand = interaction.options.getSubcommand();
	const discordContext: DiscordContext = {
		userId: interaction.user.id,
		username: interaction.user.username,
		guildId: interaction.guildId?.toString(),
		channelId: interaction.channelId?.toString(),
		commandName: 'hifz',
		subcommand: `${hifzConfigurationGroup}.${subcommand}`,
	};

	logger.info(`Executing hifz configuration subcommand: ${subcommand}`, discordContext, { operationType: 'hifz_configuration_command' });

	try {
		switch (subcommand) {
			case subcommands.UPDATE:
				await handleUpdate(interaction, discordContext);
				return;
			case subcommands.SHOW:
				await handleShow(interaction, discordContext);
				return;
			default:
				await interaction.reply({ content: 'Unknown hifz configuration command.', flags: MessageFlags.Ephemeral });
		}
	} catch (error) {
		logger.error(`Error executing hifz configuration subcommand: ${subcommand}`, error as Error, discordContext, {
			operationType: 'hifz_configuration_command',
			operationStatus: 'failure',
		});
		await interaction.reply({ content: 'There was an error executing this command!', flags: MessageFlags.Ephemeral });
	}
}

async function handleUpdate(interaction: any, discordContext: DiscordContext): Promise<void> {
	const updates: any = {};
	const replyMessages: string[] = [];
	const configuration = await configurationRepository.getConfiguration();

	const hifzEnabled = interaction.options.getBoolean(options.HIFZ_ENABLED);
	if (hifzEnabled !== null) {
		updates.hifzEnabled = hifzEnabled ? 1 : 0;
		replyMessages.push(`Hifz feature ${hifzEnabled ? 'enabled' : 'disabled'}.`);
	}

	const hifzRole = interaction.options.getRole(options.HIFZ_ROLE);
	if (hifzRole) {
		updates.hifzRoleId = hifzRole.id;
		replyMessages.push(`Hifz role set to ${hifzRole}.`);
	}

	const hifzTime = interaction.options.getString(options.HIFZ_TIME);
	if (hifzTime) {
		const parsedTime = parseReminderTime(hifzTime);
		if (!parsedTime) {
			await interaction.reply({
				content: 'Invalid hifz time. Please use `H:MM AM/PM`, such as `6:00 PM` or `12:00 AM`.',
				flags: MessageFlags.Ephemeral,
			});
			return;
		}
		updates.hifzTime = parsedTime.displayTime;
		replyMessages.push(`Hifz time set to \`${parsedTime.displayTime}\`.`);
	}

	const hifzReminderEnabled = interaction.options.getBoolean(options.HIFZ_REMINDER_ENABLED);
	if (hifzReminderEnabled !== null) {
		updates.hifzReminderEnabled = hifzReminderEnabled ? 1 : 0;
		replyMessages.push(`Hifz reminder stage ${hifzReminderEnabled ? 'enabled' : 'disabled'}.`);
	}

	const hifzPreReminderEnabled = interaction.options.getBoolean(options.HIFZ_PRE_REMINDER_ENABLED);
	if (hifzPreReminderEnabled !== null) {
		updates.hifzPreReminderEnabled = hifzPreReminderEnabled ? 1 : 0;
		replyMessages.push(`Hifz pre-reminder stage ${hifzPreReminderEnabled ? 'enabled' : 'disabled'}.`);
	}

	const hifzPreReminderMinutes = interaction.options.getInteger(options.HIFZ_PRE_REMINDER_MINUTES);
	if (hifzPreReminderMinutes !== null) {
		updates.hifzPreReminderOffsetMinutes = hifzPreReminderMinutes;
		replyMessages.push(`Hifz pre-reminder set to \`${hifzPreReminderMinutes}\` minute(s) before hifz.`);
	}

	const hifzTimeSyncEnabled = interaction.options.getBoolean(options.HIFZ_TIME_SYNC_ENABLED);
	if (hifzTimeSyncEnabled !== null) {
		updates.hifzTimeSyncEnabled = hifzTimeSyncEnabled ? 1 : 0;
		replyMessages.push(`Hifz time sync ${hifzTimeSyncEnabled ? 'enabled' : 'disabled'}.`);
	}

	const hifzTimeSyncPrayer = interaction.options.getString(options.HIFZ_TIME_SYNC_PRAYER);
	if (hifzTimeSyncPrayer) {
		updates.hifzTimeSyncPrayer = hifzTimeSyncPrayer;
		replyMessages.push(`Hifz time sync prayer set to \`${hifzTimeSyncPrayer}\`.`);
	}

	const hifzMinutesAfterPrayer = interaction.options.getInteger(options.HIFZ_MINUTES_AFTER_PRAYER);
	if (hifzMinutesAfterPrayer !== null) {
		updates.hifzTimeSyncOffsetMinutes = hifzMinutesAfterPrayer;
		replyMessages.push(`Hifz time sync set to \`${hifzMinutesAfterPrayer}\` minute(s) after the prayer.`);
	}

	if (Object.keys(updates).length === 0) {
		await interaction.reply({ content: 'No options provided.', flags: MessageFlags.Ephemeral });
		return;
	}

	await configurationRepository.updateConfiguration(updates);

	const wasHifzEnabled = isHifzReminderStageEnabled(configuration.hifzEnabled, true);
	const isNowEnabled = updates.hifzEnabled !== undefined ? isHifzReminderStageEnabled(updates.hifzEnabled as boolean | number, true) : wasHifzEnabled;

	if (shouldSyncHifzTime(updates, configuration, isNowEnabled)) {
		try {
			const syncResult = await syncHifzTimeFromPrayer(interaction.client, { reschedule: false, announceChange: false });
			if (syncResult.changed && syncResult.reminderTime) {
				updates.hifzTime = syncResult.reminderTime;
				replyMessages.push(`<@&${resolveHifzRoleId(configuration)}> Hifz Time has been changed to \`${syncResult.reminderTime}\`.`);
			}
		} catch (error) {
			logger.error('Failed to sync hifz time during configuration update', error as Error, discordContext, {
				operationType: 'hifz_time_sync',
				operationStatus: 'failure',
			});
			replyMessages.push('Hifz time sync failed. The regular checker will retry it.');
		}
	}

	if (shouldRescheduleHifzTimeSync(updates)) {
		await scheduleHifzTimeSync(interaction.client, false);
	}

	if (shouldRescheduleHifzReminder(updates)) {
		await scheduleHifzReminder(interaction.client);
	}

	logger.info(`Hifz configuration updated successfully`, discordContext, { operationType: 'hifz_configuration_update', operationStatus: 'success' });
	await interaction.reply(replyMessages.join('\n'));
}

async function handleShow(interaction: any, discordContext: DiscordContext): Promise<void> {
	const configuration = await configurationRepository.getConfiguration();
	logger.info(`Displaying current hifz configuration`, discordContext, { operationType: 'hifz_configuration_show', operationStatus: 'success' });

	const hifzRoleId = resolveHifzRoleId(configuration);

	const embed = new EmbedBuilder()
		.setTitle('Hifz Configuration')
		.addFields(
			{ name: 'Enabled', value: isHifzReminderStageEnabled(configuration.hifzEnabled, true) ? 'Yes' : 'No', inline: true },
			{ name: 'Reminder Time', value: configuration.hifzTime ?? DEFAULT_HIFZ_TIME, inline: true },
			{ name: 'Role', value: hifzRoleId ? `<@&${hifzRoleId}>` : 'Not set', inline: true },
			{
				name: 'Pre-reminder',
				value: formatHifzPreReminderConfig(configuration.hifzPreReminderEnabled, configuration.hifzPreReminderOffsetMinutes),
				inline: true,
			},
			{
				name: 'Hifz reminder',
				value: isHifzReminderStageEnabled(configuration.hifzReminderEnabled, defaultHifzCadence.mainReminderEnabled) ? 'Enabled' : 'Disabled',
				inline: true,
			},
			{
				name: 'Hifz time sync',
				value: formatHifzTimeSyncConfig(configuration),
				inline: false,
			}
		)
		.setColor(0x0099ff);

	await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

function shouldRescheduleHifzReminder(updates: Record<string, unknown>): boolean {
	return Boolean(
		updates.hifzEnabled !== undefined ||
			updates.hifzTime ||
			updates.timezone ||
			updates.hifzRoleId ||
			updates.hifzReminderEnabled !== undefined ||
			updates.hifzPreReminderEnabled !== undefined ||
			updates.hifzPreReminderOffsetMinutes !== undefined
	);
}

function shouldRescheduleHifzTimeSync(updates: Record<string, unknown>): boolean {
	return Boolean(updates.hifzEnabled !== undefined || updates.hifzTimeSyncEnabled !== undefined || updates.timezone);
}

function shouldSyncHifzTime(updates: Record<string, unknown>, configuration: Awaited<ReturnType<typeof configurationRepository.getConfiguration>>, isNowEnabled: boolean): boolean {
	if (!isNowEnabled) {
		return false;
	}

	const nextSyncEnabled =
		updates.hifzTimeSyncEnabled !== undefined
			? isPrayerSyncEnabled(updates.hifzTimeSyncEnabled as boolean | number, true)
			: isPrayerSyncEnabled(configuration.hifzTimeSyncEnabled, true);

	if (!nextSyncEnabled) {
		return false;
	}

	return Boolean(
		updates.hifzTimeSyncEnabled !== undefined ||
			updates.hifzTimeSyncPrayer !== undefined ||
			updates.hifzTimeSyncOffsetMinutes !== undefined ||
			updates.timezone
	);
}

function formatHifzPreReminderConfig(enabledValue: boolean | number | undefined, offsetMinutes: number | undefined): string {
	const status = isHifzReminderStageEnabled(enabledValue, defaultHifzCadence.preReminderEnabled) ? 'Enabled' : 'Disabled';
	const minutes = getHifzReminderOffset(offsetMinutes, defaultHifzCadence.preReminderOffsetMinutes);
	return `${status}, ${minutes} minute(s) before`;
}

function formatHifzTimeSyncConfig(configuration: Awaited<ReturnType<typeof configurationRepository.getConfiguration>>): string {
	if (!isPrayerSyncEnabled(configuration.hifzTimeSyncEnabled, true)) {
		return 'Disabled';
	}

	const prayer = resolveHifzTimeSyncPrayer(configuration.hifzTimeSyncPrayer);
	const minutes = getPrayerSyncOffsetMinutes(configuration.hifzTimeSyncOffsetMinutes, DEFAULT_HIFZ_TIME_SYNC_OFFSET_MINUTES);
	return `Enabled, ${minutes} minute(s) after ${prayer}.`;
}
