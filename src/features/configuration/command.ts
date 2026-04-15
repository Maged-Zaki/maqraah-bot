import { SlashCommandBuilder, ChannelType, MessageFlags, EmbedBuilder } from 'discord.js';
import { configurationRepository } from '../../infrastructure/database';
import { logger, DiscordContext } from '../../infrastructure/logging/logger';
import { defaultReminderCadence, getReminderOffset, isReminderStageEnabled, isValidTimeZone } from '../reminders/cadence';
import { scheduleMaqraahTimeSync, syncMaqraahTimeFromMaghrib } from '../reminders/maqraahTimeSync';
import { getMaqraahTimeSyncOffsetMinutes, isMaqraahTimeSyncEnabled, isValidLatitude, isValidLongitude } from '../reminders/prayerTimes';
import { scheduleReminder } from '../reminders/scheduler';
import { updateReminderVoiceChannelName } from '../reminders/voiceChannel';

const subcommands = {
	UPDATE: 'update',
	SHOW: 'show',
} as const;

const options = {
	ROLE: 'role',
	VOICE_CHANNEL: 'voicechannel',
	TIMEZONE: 'timezone',
	PRE_REMINDER_ENABLED: 'pre-reminder-enabled',
	PRE_REMINDER_MINUTES: 'pre-reminder-minutes',
	MAQRAAH_REMINDER_ENABLED: 'maqraah-reminder-enabled',
	MAQRAAH_TIME_SYNC_ENABLED: 'maqraah-time-sync-enabled',
	MAQRAAH_MINUTES_AFTER_MAGHRIB: 'maqraah-minutes-after-maghrib',
	PRAYER_TIME_LATITUDE: 'prayer-time-latitude',
	PRAYER_TIME_LONGITUDE: 'prayer-time-longitude',
} as const;

export const data = new SlashCommandBuilder()
	.setName('configuration')
	.setDescription('Manage bot configuration')
	.addSubcommand((subcommand) =>
		subcommand
			.setName(subcommands.UPDATE)
			.setDescription('Update configuration settings')
			.addRoleOption((option) => option.setName(options.ROLE).setDescription('Role to ping for reminders'))
			.addChannelOption((option) =>
				option.setName(options.VOICE_CHANNEL).setDescription('Voice channel to update with time').addChannelTypes(ChannelType.GuildVoice)
			)
			.addStringOption((option) => option.setName(options.TIMEZONE).setDescription('Timezone for reminders (e.g., Africa/Cairo)'))
			.addBooleanOption((option) => option.setName(options.PRE_REMINDER_ENABLED).setDescription('Enable the pre-reminder stage'))
			.addIntegerOption((option) =>
				option.setName(options.PRE_REMINDER_MINUTES).setDescription('Minutes before the maqraah to send the pre-reminder').setMinValue(0)
			)
			.addBooleanOption((option) => option.setName(options.MAQRAAH_REMINDER_ENABLED).setDescription('Enable the maqraah reminder stage'))
			.addBooleanOption((option) =>
				option.setName(options.MAQRAAH_TIME_SYNC_ENABLED).setDescription('Automatically adjust the maqraah time from Maghrib prayer time')
			)
			.addIntegerOption((option) =>
				option
					.setName(options.MAQRAAH_MINUTES_AFTER_MAGHRIB)
					.setDescription('Minutes after Maghrib for the maqraah time')
					.setMinValue(0)
			)
			.addNumberOption((option) =>
				option.setName(options.PRAYER_TIME_LATITUDE).setDescription('Latitude for Maghrib prayer time, e.g. 30.0444').setMinValue(-90).setMaxValue(90)
			)
			.addNumberOption((option) =>
				option
					.setName(options.PRAYER_TIME_LONGITUDE)
					.setDescription('Longitude for Maghrib prayer time, e.g. 31.2357')
					.setMinValue(-180)
					.setMaxValue(180)
			)
	)
	.addSubcommand((subcommand) => subcommand.setName(subcommands.SHOW).setDescription('Display current configuration'));

export async function execute(interaction: any) {
	const subcommand = interaction.options.getSubcommand();

	const discordContext: DiscordContext = {
		userId: interaction.user.id,
		username: interaction.user.username,
		guildId: interaction.guildId?.toString(),
		channelId: interaction.channelId?.toString(),
		commandName: 'configuration',
		subcommand,
	};

	logger.info(`Executing configuration subcommand: ${subcommand}`, discordContext, { operationType: 'configuration_command' });

	try {
		switch (subcommand) {
			case subcommands.UPDATE: {
				const updates: any = {};
				let replyMessages: string[] = [];
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

				const timezone = interaction.options.getString(options.TIMEZONE);
				if (timezone) {
					if (!isValidTimeZone(timezone)) {
						logger.warn(`Invalid timezone provided: ${timezone}`, discordContext, {
							operationType: 'configuration_update',
							operationStatus: 'failure',
						});
						await interaction.reply({
							content: 'Invalid timezone. Please use an IANA timezone like `Africa/Cairo`, `America/New_York`, or `Europe/London`.',
							flags: MessageFlags.Ephemeral,
						});
						return;
					}
					updates.timezone = timezone;
					replyMessages.push(`Timezone set to \`${timezone}\`.`);
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

				const maqraahMinutesAfterMaghrib = interaction.options.getInteger(options.MAQRAAH_MINUTES_AFTER_MAGHRIB);
				if (maqraahMinutesAfterMaghrib !== null) {
					updates.maqraahTimeSyncOffsetMinutes = maqraahMinutesAfterMaghrib;
					replyMessages.push(`Maqraah time sync set to \`${maqraahMinutesAfterMaghrib}\` minute(s) after Maghrib.`);
				}

				const prayerTimeLatitude = interaction.options.getNumber(options.PRAYER_TIME_LATITUDE);
				if (prayerTimeLatitude !== null) {
					if (!isValidLatitude(prayerTimeLatitude)) {
						await interaction.reply({
							content: 'Invalid latitude. Please provide a number from -90 to 90.',
							flags: MessageFlags.Ephemeral,
						});
						return;
					}
					updates.maqraahTimeSyncLatitude = prayerTimeLatitude;
					replyMessages.push(`Prayer time latitude set to \`${prayerTimeLatitude}\`.`);
				}

				const prayerTimeLongitude = interaction.options.getNumber(options.PRAYER_TIME_LONGITUDE);
				if (prayerTimeLongitude !== null) {
					if (!isValidLongitude(prayerTimeLongitude)) {
						await interaction.reply({
							content: 'Invalid longitude. Please provide a number from -180 to 180.',
							flags: MessageFlags.Ephemeral,
						});
						return;
					}
					updates.maqraahTimeSyncLongitude = prayerTimeLongitude;
					replyMessages.push(`Prayer time longitude set to \`${prayerTimeLongitude}\`.`);
				}

				if (Object.keys(updates).length > 0) {
					logger.info(`Updating configuration with changes`, discordContext, { additionalData: { updates } });
					await configurationRepository.updateConfiguration(updates);

					let voiceChannelTime = updates.dailyTime as string | undefined;
					if (shouldRescheduleMaqraahTimeSync(updates)) {
						await scheduleMaqraahTimeSync(interaction.client, false);
					}

					if (shouldSyncMaqraahTime(updates, configuration)) {
						try {
							const syncResult = await syncMaqraahTimeFromMaghrib(interaction.client, {
								reschedule: false,
								updateVoiceChannel: false,
								announceChange: false,
							});
							if (syncResult.changed && syncResult.timing) {
								updates.dailyTime = syncResult.timing.reminderTime;
								voiceChannelTime = syncResult.timing.reminderTime;
								replyMessages.push(
									`<@&${configuration.roleId}> Maqraah Time has been changed to \`${syncResult.timing.reminderTime}\`.`
								);
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
						logger.info(`Rescheduling reminder due to configuration changes`, discordContext);
						await scheduleReminder(interaction.client);
					}

					if (voiceChannelTime) {
						await updateReminderVoiceChannelName(interaction.client, voiceChannelTime);
					}

					logger.info(`Configuration updated successfully`, discordContext, { operationType: 'configuration_update', operationStatus: 'success' });
					await interaction.reply(replyMessages.join('\n'));
				} else {
					logger.info(`No configuration changes provided`, discordContext);
					await interaction.reply({ content: 'No options provided.', flags: MessageFlags.Ephemeral });
				}
				break;
			}
			case subcommands.SHOW: {
				const configuration = await configurationRepository.getConfiguration();

				logger.info(`Displaying current configuration`, discordContext, { operationType: 'configuration_show', operationStatus: 'success' });

				const embed = new EmbedBuilder()
					.setTitle('Configuration')
					.addFields(
						{ name: 'Reminder Time', value: configuration.dailyTime, inline: true },
						{ name: 'Timezone', value: configuration.timezone, inline: true },
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

				await interaction.reply({
					embeds: [embed],
					ephemeral: true,
				});
				break;
			}
		}
	} catch (error) {
		logger.error(`Error executing configuration subcommand: ${subcommand}`, error as Error, discordContext, {
			operationType: 'configuration_command',
			operationStatus: 'failure',
			additionalData: {
				subcommand,
				userId: interaction.user.id,
				guildId: interaction.guildId?.toString(),
				channelId: interaction.channelId?.toString(),
			},
		});
		await interaction.reply({ content: 'There was an error executing this command!', flags: MessageFlags.Ephemeral });
	}
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
			? isMaqraahTimeSyncEnabled(updates.maqraahTimeSyncEnabled as boolean | number)
			: isMaqraahTimeSyncEnabled(configuration.maqraahTimeSyncEnabled);

	if (!nextEnabled) {
		return false;
	}

	return Boolean(
		updates.maqraahTimeSyncEnabled !== undefined ||
			updates.maqraahTimeSyncOffsetMinutes !== undefined ||
			updates.maqraahTimeSyncLatitude !== undefined ||
			updates.maqraahTimeSyncLongitude !== undefined ||
			updates.timezone
	);
}

function formatPreReminderConfig(enabledValue: boolean | number, offsetMinutes: number): string {
	const status = formatStageConfig(enabledValue, defaultReminderCadence.preReminderEnabled);
	const minutes = getReminderOffset(offsetMinutes, defaultReminderCadence.preReminderOffsetMinutes);
	return `${status}, ${minutes} minute(s) before`;
}

function formatMaqraahTimeSyncConfig(configuration: Awaited<ReturnType<typeof configurationRepository.getConfiguration>>): string {
	if (!isMaqraahTimeSyncEnabled(configuration.maqraahTimeSyncEnabled)) {
		return 'Disabled';
	}

	const minutes = getMaqraahTimeSyncOffsetMinutes(configuration.maqraahTimeSyncOffsetMinutes);
	return `Enabled, ${minutes} minute(s) after Maghrib. Location: ${configuration.maqraahTimeSyncLatitude}, ${configuration.maqraahTimeSyncLongitude}.`;
}

function formatStageConfig(enabledValue: boolean | number, defaultEnabled: boolean): string {
	return isReminderStageEnabled(enabledValue, defaultEnabled) ? 'Enabled' : 'Disabled';
}
