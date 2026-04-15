import { SlashCommandBuilder, ChannelType, MessageFlags, EmbedBuilder } from 'discord.js';
import { configurationRepository } from '../../infrastructure/database';
import { logger, DiscordContext } from '../../infrastructure/logging/logger';
import { defaultReminderCadence, getReminderOffset, isReminderStageEnabled, isValidTimeZone, parseTimeToCron } from '../reminders/cadence';
import { scheduleMaghribReminderUpdater, syncMaghribReminderTime } from '../reminders/maghribReminderUpdater';
import {
	getMaghribReminderOffsetMinutes,
	isMaghribReminderEnabled,
	isValidCalculationMethod,
	isValidLatitude,
	isValidLongitude,
} from '../reminders/prayerTimes';
import { scheduleReminder } from '../reminders/scheduler';
import { updateReminderVoiceChannelName } from '../reminders/voiceChannel';

const subcommands = {
	UPDATE: 'update',
	SHOW: 'show',
} as const;

const options = {
	ROLE: 'role',
	VOICE_CHANNEL: 'voicechannel',
	TIME: 'time',
	TIMEZONE: 'timezone',
	PRE_REMINDER_ENABLED: 'pre-reminder-enabled',
	PRE_REMINDER_MINUTES: 'pre-reminder-minutes',
	MAQRAAH_REMINDER_ENABLED: 'maqraah-reminder-enabled',
	MAGHRIB_REMINDER_ENABLED: 'maghrib-reminder-enabled',
	MAGHRIB_REMINDER_MINUTES_AFTER: 'maghrib-reminder-minutes-after',
	MAGHRIB_LATITUDE: 'maghrib-latitude',
	MAGHRIB_LONGITUDE: 'maghrib-longitude',
	MAGHRIB_CALCULATION_METHOD: 'maghrib-calculation-method',
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
			.addStringOption((option) => option.setName(options.TIME).setDescription('Daily Maqraah reminder time (HH:MM AM/PM)'))
			.addStringOption((option) => option.setName(options.TIMEZONE).setDescription('Timezone for reminders (e.g., Africa/Cairo)'))
			.addBooleanOption((option) => option.setName(options.PRE_REMINDER_ENABLED).setDescription('Enable the pre-reminder stage'))
			.addIntegerOption((option) =>
				option.setName(options.PRE_REMINDER_MINUTES).setDescription('Minutes before the maqraah to send the pre-reminder').setMinValue(0)
			)
			.addBooleanOption((option) => option.setName(options.MAQRAAH_REMINDER_ENABLED).setDescription('Enable the maqraah reminder stage'))
			.addBooleanOption((option) =>
				option.setName(options.MAGHRIB_REMINDER_ENABLED).setDescription('Automatically set the maqraah reminder from Maghrib time')
			)
			.addIntegerOption((option) =>
				option
					.setName(options.MAGHRIB_REMINDER_MINUTES_AFTER)
					.setDescription('Minutes after Maghrib to send the maqraah reminder')
					.setMinValue(0)
			)
			.addNumberOption((option) =>
				option.setName(options.MAGHRIB_LATITUDE).setDescription('Latitude for Maghrib prayer time, e.g. 30.0444').setMinValue(-90).setMaxValue(90)
			)
			.addNumberOption((option) =>
				option
					.setName(options.MAGHRIB_LONGITUDE)
					.setDescription('Longitude for Maghrib prayer time, e.g. 31.2357')
					.setMinValue(-180)
					.setMaxValue(180)
			)
			.addIntegerOption((option) =>
				option.setName(options.MAGHRIB_CALCULATION_METHOD).setDescription('AlAdhan calculation method id').setMinValue(0)
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

				const time = interaction.options.getString(options.TIME);
				if (time) {
					if (!parseTimeToCron(time)) {
						logger.warn(`Invalid time format provided: ${time}`, discordContext, {
							operationType: 'configuration_update',
							operationStatus: 'failure',
						});
						await interaction.reply({
							content: 'Invalid time format. Please use HH:MM AM/PM format, e.g., "12:00 AM".',
							flags: MessageFlags.Ephemeral,
						});
						return;
					}
					updates.dailyTime = time;
					replyMessages.push(`<@&${configuration.roleId}> Maqraah Time has been changed to \`${time}\`.`);
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

				const maghribReminderEnabled = interaction.options.getBoolean(options.MAGHRIB_REMINDER_ENABLED);
				if (maghribReminderEnabled !== null) {
					updates.maghribReminderEnabled = maghribReminderEnabled ? 1 : 0;
					replyMessages.push(`Automatic Maghrib reminder ${maghribReminderEnabled ? 'enabled' : 'disabled'}.`);
				}

				const maghribReminderMinutesAfter = interaction.options.getInteger(options.MAGHRIB_REMINDER_MINUTES_AFTER);
				if (maghribReminderMinutesAfter !== null) {
					updates.maghribReminderOffsetMinutes = maghribReminderMinutesAfter;
					replyMessages.push(`Automatic Maghrib reminder set to \`${maghribReminderMinutesAfter}\` minute(s) after Maghrib.`);
				}

				const maghribLatitude = interaction.options.getNumber(options.MAGHRIB_LATITUDE);
				if (maghribLatitude !== null) {
					if (!isValidLatitude(maghribLatitude)) {
						await interaction.reply({
							content: 'Invalid latitude. Please provide a number from -90 to 90.',
							flags: MessageFlags.Ephemeral,
						});
						return;
					}
					updates.maghribReminderLatitude = maghribLatitude;
					replyMessages.push(`Maghrib latitude set to \`${maghribLatitude}\`.`);
				}

				const maghribLongitude = interaction.options.getNumber(options.MAGHRIB_LONGITUDE);
				if (maghribLongitude !== null) {
					if (!isValidLongitude(maghribLongitude)) {
						await interaction.reply({
							content: 'Invalid longitude. Please provide a number from -180 to 180.',
							flags: MessageFlags.Ephemeral,
						});
						return;
					}
					updates.maghribReminderLongitude = maghribLongitude;
					replyMessages.push(`Maghrib longitude set to \`${maghribLongitude}\`.`);
				}

				const maghribCalculationMethod = interaction.options.getInteger(options.MAGHRIB_CALCULATION_METHOD);
				if (maghribCalculationMethod !== null) {
					if (!isValidCalculationMethod(maghribCalculationMethod)) {
						await interaction.reply({
							content: 'Invalid calculation method. Please provide an AlAdhan method id of 0 or greater.',
							flags: MessageFlags.Ephemeral,
						});
						return;
					}
					updates.maghribReminderCalculationMethod = maghribCalculationMethod;
					replyMessages.push(`Maghrib calculation method set to \`${maghribCalculationMethod}\`.`);
				}

				if (Object.keys(updates).length > 0) {
					logger.info(`Updating configuration with changes`, discordContext, { additionalData: { updates } });
					await configurationRepository.updateConfiguration(updates);

					let voiceChannelTime = updates.dailyTime as string | undefined;
					if (shouldRescheduleMaghribReminderUpdater(updates)) {
						await scheduleMaghribReminderUpdater(interaction.client, false);
					}

					if (shouldSyncMaghribReminder(updates, configuration)) {
						try {
							const syncResult = await syncMaghribReminderTime(interaction.client, {
								reschedule: false,
								updateVoiceChannel: false,
							});
							if (syncResult.changed && syncResult.timing) {
								updates.dailyTime = syncResult.timing.reminderTime;
								voiceChannelTime = syncResult.timing.reminderTime;
								replyMessages.push(
									`Maqraah reminder synced to \`${syncResult.timing.reminderTime}\` from Maghrib \`${syncResult.timing.maghribTime}\` on ${syncResult.timing.date}.`
								);
							}
						} catch (error) {
							logger.error('Failed to sync Maghrib reminder during configuration update', error as Error, discordContext, {
								operationType: 'maghrib_reminder_sync',
								operationStatus: 'failure',
							});
							replyMessages.push('Automatic Maghrib reminder sync failed. The regular checker will retry it.');
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
							name: 'Automatic Maghrib reminder',
							value: formatMaghribReminderConfig(configuration),
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

function shouldRescheduleMaghribReminderUpdater(updates: Record<string, unknown>): boolean {
	return Boolean(updates.maghribReminderEnabled !== undefined || updates.timezone);
}

function shouldSyncMaghribReminder(updates: Record<string, unknown>, configuration: Awaited<ReturnType<typeof configurationRepository.getConfiguration>>): boolean {
	const nextEnabled =
		updates.maghribReminderEnabled !== undefined
			? isMaghribReminderEnabled(updates.maghribReminderEnabled as boolean | number)
			: isMaghribReminderEnabled(configuration.maghribReminderEnabled);

	if (!nextEnabled) {
		return false;
	}

	return Boolean(
		updates.maghribReminderEnabled !== undefined ||
			updates.maghribReminderOffsetMinutes !== undefined ||
			updates.maghribReminderLatitude !== undefined ||
			updates.maghribReminderLongitude !== undefined ||
			updates.maghribReminderCalculationMethod !== undefined ||
			updates.timezone
	);
}

function formatPreReminderConfig(enabledValue: boolean | number, offsetMinutes: number): string {
	const status = formatStageConfig(enabledValue, defaultReminderCadence.preReminderEnabled);
	const minutes = getReminderOffset(offsetMinutes, defaultReminderCadence.preReminderOffsetMinutes);
	return `${status}, ${minutes} minute(s) before`;
}

function formatMaghribReminderConfig(configuration: Awaited<ReturnType<typeof configurationRepository.getConfiguration>>): string {
	if (!isMaghribReminderEnabled(configuration.maghribReminderEnabled)) {
		return 'Disabled';
	}

	const minutes = getMaghribReminderOffsetMinutes(configuration.maghribReminderOffsetMinutes);
	return `Enabled, ${minutes} minute(s) after Maghrib. Location: ${configuration.maghribReminderLatitude}, ${configuration.maghribReminderLongitude}. Method: ${configuration.maghribReminderCalculationMethod}.`;
}

function formatStageConfig(enabledValue: boolean | number, defaultEnabled: boolean): string {
	return isReminderStageEnabled(enabledValue, defaultEnabled) ? 'Enabled' : 'Disabled';
}
