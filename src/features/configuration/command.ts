import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { configurationRepository } from '../../storage/sqlite';
import { logger, DiscordContext } from '../../observability/logging/logger';
import { normalizeTimeZone } from '../../shared/time';
import { isValidLatitude, isValidLongitude, isValidCalculationMethod, prayerSyncDefaults } from '../../shared/prayerSync/timings';
import { scheduleMaqraahTimeSync } from '../maqraah/reminders/maqraahTimeSync';
import { scheduleReminder } from '../maqraah/reminders/scheduler';
import { scheduleHifzTimeSync } from '../hifz/reminders/hifzTimeSync';
import { scheduleHifzReminder } from '../hifz/reminders/scheduler';

const subcommands = {
	UPDATE: 'update',
	SHOW: 'show',
} as const;

const options = {
	TIMEZONE: 'timezone',
	PRAYER_TIME_LATITUDE: 'prayer-time-latitude',
	PRAYER_TIME_LONGITUDE: 'prayer-time-longitude',
	PRAYER_CALCULATION_METHOD: 'prayer-calculation-method',
} as const;

export const data = new SlashCommandBuilder()
	.setName('configuration')
	.setDescription('Manage shared bot configuration (timezone and prayer location)')
	.addSubcommand((subcommand) =>
		subcommand
			.setName(subcommands.UPDATE)
			.setDescription('Update shared configuration settings')
			.addStringOption((option) => option.setName(options.TIMEZONE).setDescription('Timezone for all reminders and prayer lookups (e.g., Africa/Cairo)'))
			.addNumberOption((option) =>
				option.setName(options.PRAYER_TIME_LATITUDE).setDescription('Latitude for prayer time lookups, e.g. 30.0444').setMinValue(-90).setMaxValue(90)
			)
			.addNumberOption((option) =>
				option
					.setName(options.PRAYER_TIME_LONGITUDE)
					.setDescription('Longitude for prayer time lookups, e.g. 31.2357')
					.setMinValue(-180)
					.setMaxValue(180)
			)
			.addIntegerOption((option) =>
				option
					.setName(options.PRAYER_CALCULATION_METHOD)
					.setDescription('AlAdhan calculation method id (e.g. 4 = Umm al-Qura, 5 = Egyptian ASA)')
					.setMinValue(0)
			)
	)
	.addSubcommand((subcommand) => subcommand.setName(subcommands.SHOW).setDescription('Display current shared configuration'));

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
				const replyMessages: string[] = [];

				const timezone = interaction.options.getString(options.TIMEZONE);
				if (timezone) {
					const normalizedTimezone = normalizeTimeZone(timezone);
					if (!normalizedTimezone) {
						await interaction.reply({
							content: 'Invalid timezone. Please use an IANA timezone like `Africa/Cairo`, `America/New_York`, or `Europe/London`.',
							flags: MessageFlags.Ephemeral,
						});
						return;
					}
					updates.timezone = normalizedTimezone;
					replyMessages.push(`Timezone set to \`${normalizedTimezone}\`.`);
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

				const prayerCalculationMethod = interaction.options.getInteger(options.PRAYER_CALCULATION_METHOD);
				if (prayerCalculationMethod !== null) {
					if (!isValidCalculationMethod(prayerCalculationMethod)) {
						await interaction.reply({
							content: 'Invalid calculation method. Please provide a non-negative integer method id.',
							flags: MessageFlags.Ephemeral,
						});
						return;
					}
					updates.maqraahTimeSyncCalculationMethod = prayerCalculationMethod;
					replyMessages.push(`Prayer calculation method set to \`${prayerCalculationMethod}\`.`);
				}

				if (Object.keys(updates).length > 0) {
					await configurationRepository.updateConfiguration(updates);

					// Timezone and prayer location affect both features' reminders and time-sync crons.
					await scheduleMaqraahTimeSync(interaction.client, false);
					await scheduleHifzTimeSync(interaction.client, false);
					await scheduleReminder(interaction.client);
					await scheduleHifzReminder(interaction.client);

					logger.info(`Configuration updated successfully`, discordContext, { operationType: 'configuration_update', operationStatus: 'success' });
					await interaction.reply(replyMessages.join('\n'));
				} else {
					await interaction.reply({ content: 'No options provided.', flags: MessageFlags.Ephemeral });
				}
				break;
			}
			case subcommands.SHOW: {
				const configuration = await configurationRepository.getConfiguration();

				logger.info(`Displaying current configuration`, discordContext, { operationType: 'configuration_show', operationStatus: 'success' });

				const embed = new EmbedBuilder()
					.setTitle('Configuration')
					.setDescription('Shared settings. Maqraah and hifz-specific settings live under `/maqraah configuration` and `/hifz configuration`.')
					.addFields(
						{ name: 'Timezone', value: configuration.timezone, inline: true },
						{
							name: 'Prayer Latitude',
							value: String(configuration.maqraahTimeSyncLatitude ?? prayerSyncDefaults.latitude),
							inline: true,
						},
						{
							name: 'Prayer Longitude',
							value: String(configuration.maqraahTimeSyncLongitude ?? prayerSyncDefaults.longitude),
							inline: true,
						},
						{
							name: 'Calculation Method',
							value: String(configuration.maqraahTimeSyncCalculationMethod ?? prayerSyncDefaults.calculationMethod),
							inline: true,
						}
					)
					.setColor(0x0099ff);

				await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
				break;
			}
		}
	} catch (error) {
		logger.error(`Error executing configuration subcommand: ${subcommand}`, error as Error, discordContext, {
			operationType: 'configuration_command',
			operationStatus: 'failure',
		});
		await interaction.reply({ content: 'There was an error executing this command!', flags: MessageFlags.Ephemeral });
	}
}
