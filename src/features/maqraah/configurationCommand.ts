import { ChannelType, EmbedBuilder, MessageFlags, SlashCommandSubcommandGroupBuilder } from 'discord.js';
import { configurationRepository } from '../../storage/sqlite';
import { logger, DiscordContext } from '../../observability/logging/logger';
import { parseReminderTime } from '../../shared/time';
import type { PrayerName } from '../../shared/prayers';
import { getPrayerSyncOffsetMinutes, isPrayerSyncEnabled } from '../../shared/prayerSync/timings';
import { defaultReminderCadence, getReminderOffset, isReminderStageEnabled } from './reminders/cadence';
import { resolveMaqraahTimeSyncPrayer, scheduleMaqraahTimeSync, syncMaqraahTimeFromPrayer } from './reminders/maqraahTimeSync';
import { scheduleReminder } from './reminders/scheduler';
import { updateReminderVoiceChannelName } from './reminders/voiceChannel';

export const maqraahConfigurationGroup = 'configuration';

const subcommands = {
	UPDATE: 'update',
	SHOW: 'show',
} as const;

const options = {
	ROLE: 'role',
	VOICE_CHANNEL: 'voicechannel',
	MAQRAAH_TIME: 'maqraah-time',
	PRE_REMINDER_ENABLED: 'pre-reminder-enabled',
	PRE_REMINDER_MINUTES: 'pre-reminder-minutes',
	MAQRAAH_REMINDER_ENABLED: 'maqraah-reminder-enabled',
	MAQRAAH_TIME_SYNC_ENABLED: 'maqraah-time-sync-enabled',
	MAQRAAH_TIME_SYNC_PRAYER: 'maqraah-time-sync-prayer',
	MAQRAAH_MINUTES_AFTER_PRAYER: 'maqraah-minutes-after-prayer',
} as const;

const prayerChoices: Array<{ name: string; value: PrayerName }> = [
	{ name: 'Fajr', value: 'fajr' },
	{ name: 'Sunrise', value: 'sunrise' },
	{ name: 'Dhuhr', value: 'dhuhr' },
	{ name: 'Asr', value: 'asr' },
	{ name: 'Maghrib', value: 'maghrib' },
	{ name: 'Isha', value: 'isha' },
];

export function addMaqraahConfigurationSubcommands(group: SlashCommandSubcommandGroupBuilder): SlashCommandSubcommandGroupBuilder {
	group
		.addSubcommand((subcommand) =>
			subcommand
				.setName(subcommands.UPDATE)
				.setDescription('Update maqraah configuration')
				.addRoleOption((option) => option.setName(options.ROLE).setDescription('Role to ping for maqraah reminders'))
				.addChannelOption((option) =>
					option.setName(options.VOICE_CHANNEL).setDescription('Voice channel to rename with the maqraah time').addChannelTypes(ChannelType.GuildVoice)
				)
				.addStringOption((option) => option.setName(options.MAQRAAH_TIME).setDescription('Maqraah reminder time (e.g., 9:05 PM)'))
				.addBooleanOption((option) => option.setName(options.PRE_REMINDER_ENABLED).setDescription('Enable the pre-reminder stage'))
				.addIntegerOption((option) =>
					option.setName(options.PRE_REMINDER_MINUTES).setDescription('Minutes before the maqraah to send the pre-reminder').setMinValue(0)
				)
				.addBooleanOption((option) => option.setName(options.MAQRAAH_REMINDER_ENABLED).setDescription('Enable the maqraah reminder stage'))
				.addBooleanOption((option) =>
					option.setName(options.MAQRAAH_TIME_SYNC_ENABLED).setDescription('Automatically adjust the maqraah time from a prayer time')
				)
				.addStringOption((option) =>
					option
						.setName(options.MAQRAAH_TIME_SYNC_PRAYER)
						.setDescription('Prayer to sync the maqraah time to')
						.addChoices(...prayerChoices)
				)
				.addIntegerOption((option) =>
					option.setName(options.MAQRAAH_MINUTES_AFTER_PRAYER).setDescription('Minutes after the prayer for the maqraah time').setMinValue(0)
				)
		)
		.addSubcommand((subcommand) => subcommand.setName(subcommands.SHOW).setDescription('Display current maqraah configuration'));
	return group;
}

export async function handleMaqraahConfigurationCommand(interaction: any): Promise<void> {
	const subcommand = interaction.options.getSubcommand();
	const discordContext: DiscordContext = {
		userId: interaction.user.id,
		username: interaction.user.username,
		guildId: interaction.guildId?.toString(),
		channelId: interaction.channelId?.toString(),
		commandName: 'maqraah',
		subcommand: `${maqraahConfigurationGroup}.${subcommand}`,
	};

	logger.info(`Executing maqraah configuration subcommand: ${subcommand}`, discordContext, { operationType: 'maqraah_configuration_command' });

	try {
		switch (subcommand) {
			case subcommands.UPDATE:
				await handleUpdate(interaction, discordContext);
				return;
			case subcommands.SHOW:
				await handleShow(interaction, discordContext);
				return;
			default:
				await interaction.reply({ content: 'Unknown maqraah configuration command.', flags: MessageFlags.Ephemeral });
		}
	} catch (error) {
		logger.error(`Error executing maqraah configuration subcommand: ${subcommand}`, error as Error, discordContext, {
			operationType: 'maqraah_configuration_command',
			operationStatus: 'failure',
		});
		await interaction.reply({ content: 'There was an error executing this command!', flags: MessageFlags.Ephemeral });
	}
}

async function handleUpdate(interaction: any, discordContext: DiscordContext): Promise<void> {
	const updates: any = {};
	const replyMessages: string[] = [];
	const configuration = await configurationRepository.getConfiguration();

	const role = interaction.options.getRole(options.ROLE);
	if (role) {
		updates.roleId = role.id;
		replyMessages.push(`Role set to ${role}.`);
	}

	const voicechannel = interaction.options.getChannel(options.VOICE_CHANNEL);
	if (voicechannel) {
		updates.voiceChannelId = voicechannel.id;
		replyMessages.push(`Voice channel set to ${voicechannel}.`);
	}

	const maqraahTime = interaction.options.getString(options.MAQRAAH_TIME);
	if (maqraahTime) {
		const parsedTime = parseReminderTime(maqraahTime);
		if (!parsedTime) {
			await interaction.reply({
				content: 'Invalid maqraah time. Please use `H:MM AM/PM`, such as `9:05 PM` or `12:00 AM`.',
				flags: MessageFlags.Ephemeral,
			});
			return;
		}
		updates.dailyTime = parsedTime.displayTime;
		replyMessages.push(`Maqraah time set to \`${parsedTime.displayTime}\`.`);
	}

	const preReminderEnabled = interaction.options.getBoolean(options.PRE_REMINDER_ENABLED);
	if (preReminderEnabled !== null) {
		updates.preReminderEnabled = preReminderEnabled ? 1 : 0;
		replyMessages.push(`Pre-reminder stage ${preReminderEnabled ? 'enabled' : 'disabled'}.`);
	}

	const preReminderMinutes = interaction.options.getInteger(options.PRE_REMINDER_MINUTES);
	if (preReminderMinutes !== null) {
		updates.preReminderOffsetMinutes = preReminderMinutes;
		replyMessages.push(`Pre-reminder set to \`${preReminderMinutes}\` minute(s) before maqraah.`);
	}

	const maqraahReminderEnabled = interaction.options.getBoolean(options.MAQRAAH_REMINDER_ENABLED);
	if (maqraahReminderEnabled !== null) {
		updates.mainReminderEnabled = maqraahReminderEnabled ? 1 : 0;
		replyMessages.push(`Maqraah reminder stage ${maqraahReminderEnabled ? 'enabled' : 'disabled'}.`);
	}

	const maqraahTimeSyncEnabled = interaction.options.getBoolean(options.MAQRAAH_TIME_SYNC_ENABLED);
	if (maqraahTimeSyncEnabled !== null) {
		updates.maqraahTimeSyncEnabled = maqraahTimeSyncEnabled ? 1 : 0;
		replyMessages.push(`Maqraah time sync ${maqraahTimeSyncEnabled ? 'enabled' : 'disabled'}.`);
	}

	const maqraahTimeSyncPrayer = interaction.options.getString(options.MAQRAAH_TIME_SYNC_PRAYER);
	if (maqraahTimeSyncPrayer) {
		updates.maqraahTimeSyncPrayer = maqraahTimeSyncPrayer;
		replyMessages.push(`Maqraah time sync prayer set to \`${maqraahTimeSyncPrayer}\`.`);
	}

	const maqraahMinutesAfterPrayer = interaction.options.getInteger(options.MAQRAAH_MINUTES_AFTER_PRAYER);
	if (maqraahMinutesAfterPrayer !== null) {
		updates.maqraahTimeSyncOffsetMinutes = maqraahMinutesAfterPrayer;
		replyMessages.push(`Maqraah time sync set to \`${maqraahMinutesAfterPrayer}\` minute(s) after the prayer.`);
	}

	if (Object.keys(updates).length === 0) {
		await interaction.reply({ content: 'No options provided.', flags: MessageFlags.Ephemeral });
		return;
	}

	await configurationRepository.updateConfiguration(updates);

	let voiceChannelTime = updates.dailyTime as string | undefined;
	if (shouldRescheduleMaqraahTimeSync(updates)) {
		await scheduleMaqraahTimeSync(interaction.client, false);
	}

	if (shouldSyncMaqraahTime(updates, configuration)) {
		try {
			const syncResult = await syncMaqraahTimeFromPrayer(interaction.client, {
				reschedule: false,
				updateVoiceChannel: false,
				announceChange: false,
			});
			if (syncResult.changed && syncResult.timing) {
				updates.dailyTime = syncResult.timing.reminderTime;
				voiceChannelTime = syncResult.timing.reminderTime;
				replyMessages.push(`<@&${configuration.roleId}> Maqraah Time has been changed to \`${syncResult.timing.reminderTime}\`.`);
			}
		} catch (error) {
			logger.error('Failed to sync maqraah time during configuration update', error as Error, discordContext, {
				operationType: 'maqraah_time_sync',
				operationStatus: 'failure',
			});
			replyMessages.push('Maqraah time sync failed. The regular checker will retry it.');
		}
	}

	if (shouldRescheduleReminder(updates)) {
		await scheduleReminder(interaction.client);
	}

	if (voiceChannelTime) {
		await updateReminderVoiceChannelName(interaction.client, voiceChannelTime);
	}

	logger.info(`Maqraah configuration updated successfully`, discordContext, { operationType: 'maqraah_configuration_update', operationStatus: 'success' });
	await interaction.reply(replyMessages.join('\n'));
}

async function handleShow(interaction: any, discordContext: DiscordContext): Promise<void> {
	const configuration = await configurationRepository.getConfiguration();
	logger.info(`Displaying current maqraah configuration`, discordContext, { operationType: 'maqraah_configuration_show', operationStatus: 'success' });

	const embed = new EmbedBuilder()
		.setTitle('Maqraah Configuration')
		.addFields(
			{ name: 'Reminder Time', value: configuration.dailyTime, inline: true },
			{ name: 'Role', value: configuration.roleId ? `<@&${configuration.roleId}>` : 'Not set', inline: true },
			{ name: 'Voice Channel', value: configuration.voiceChannelId ? `<#${configuration.voiceChannelId}>` : 'Not set', inline: true },
			{
				name: 'Pre-reminder',
				value: formatPreReminderConfig(configuration.preReminderEnabled, configuration.preReminderOffsetMinutes),
				inline: true,
			},
			{
				name: 'Maqraah reminder',
				value: isReminderStageEnabled(configuration.mainReminderEnabled, defaultReminderCadence.mainReminderEnabled) ? 'Enabled' : 'Disabled',
				inline: true,
			},
			{
				name: 'Maqraah time sync',
				value: formatMaqraahTimeSyncConfig(configuration),
				inline: false,
			}
		)
		.setColor(0x0099ff);

	await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

function shouldRescheduleReminder(updates: Record<string, unknown>): boolean {
	return Boolean(
		updates.dailyTime ||
			updates.timezone ||
			updates.roleId ||
			updates.preReminderEnabled !== undefined ||
			updates.preReminderOffsetMinutes !== undefined ||
			updates.mainReminderEnabled !== undefined
	);
}

function shouldRescheduleMaqraahTimeSync(updates: Record<string, unknown>): boolean {
	return Boolean(updates.maqraahTimeSyncEnabled !== undefined || updates.timezone);
}

function shouldSyncMaqraahTime(updates: Record<string, unknown>, configuration: Awaited<ReturnType<typeof configurationRepository.getConfiguration>>): boolean {
	const nextEnabled =
		updates.maqraahTimeSyncEnabled !== undefined
			? isPrayerSyncEnabled(updates.maqraahTimeSyncEnabled as boolean | number)
			: isPrayerSyncEnabled(configuration.maqraahTimeSyncEnabled);

	if (!nextEnabled) {
		return false;
	}

	return Boolean(
		updates.maqraahTimeSyncEnabled !== undefined ||
			updates.maqraahTimeSyncPrayer !== undefined ||
			updates.maqraahTimeSyncOffsetMinutes !== undefined ||
			updates.maqraahTimeSyncLatitude !== undefined ||
			updates.maqraahTimeSyncLongitude !== undefined ||
			updates.maqraahTimeSyncCalculationMethod !== undefined ||
			updates.timezone
	);
}

function formatPreReminderConfig(enabledValue: boolean | number, offsetMinutes: number): string {
	const status = isReminderStageEnabled(enabledValue, defaultReminderCadence.preReminderEnabled) ? 'Enabled' : 'Disabled';
	const minutes = getReminderOffset(offsetMinutes, defaultReminderCadence.preReminderOffsetMinutes);
	return `${status}, ${minutes} minute(s) before`;
}

function formatMaqraahTimeSyncConfig(configuration: Awaited<ReturnType<typeof configurationRepository.getConfiguration>>): string {
	if (!isPrayerSyncEnabled(configuration.maqraahTimeSyncEnabled)) {
		return 'Disabled';
	}

	const prayer = resolveMaqraahTimeSyncPrayer(configuration.maqraahTimeSyncPrayer);
	const minutes = getPrayerSyncOffsetMinutes(configuration.maqraahTimeSyncOffsetMinutes);
	return `Enabled, ${minutes} minute(s) after ${prayer}.`;
}
