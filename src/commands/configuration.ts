import { SlashCommandBuilder, ChannelType, MessageFlags, EmbedBuilder } from 'discord.js';
import { configurationRepository } from '../database';
import { scheduleReminder } from '../scheduler';
import { logger, DiscordContext } from '../logger';

const subcommands = {
	UPDATE: 'update',
	SHOW: 'show',
} as const;

const options = {
	ROLE: 'role',
	VOICE_CHANNEL: 'voicechannel',
	TIME: 'time',
	TIMEZONE: 'timezone',
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
					const timeRegex = /^\d{1,2}:\d{2} (AM|PM)$/i;
					if (!timeRegex.test(time)) {
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
					replyMessages.push(`<@&${configuration.roleId}> Maqraah Reminder has been changed to \`${time}\`.`);
				}

				const timezone = interaction.options.getString(options.TIMEZONE);
				if (timezone) {
					updates.timezone = timezone;
					replyMessages.push(`Timezone set to \`${timezone}\`.`);
				}

				if (Object.keys(updates).length > 0) {
					logger.info(`Updating configuration with changes`, discordContext, { additionalData: { updates } });
					await configurationRepository.updateConfiguration(updates);

					// If time or timezone or role updated, reschedule
					if (updates.dailyTime || updates.timezone || updates.roleId) {
						logger.info(`Rescheduling reminder due to configuration changes`, discordContext);
						scheduleReminder(interaction.client);
					}

					// If time updated, update voice channel name
					if (updates.dailyTime) {
						if (configuration.voiceChannelId) {
							const vc = interaction.guild?.channels.cache.get(configuration.voiceChannelId);
							if (vc && vc.isVoiceBased()) {
								const permissions = vc.permissionsFor(interaction.client.user!);
								if (permissions?.has('ManageChannels')) {
									try {
										const timeWithoutAmpm = time.replace(/\s*(AM|PM)$/i, '');
										await vc.setName(`مقراة الساعة ${timeWithoutAmpm}`);
										logger.info(`Updated voice channel name to ${timeWithoutAmpm}`, discordContext);
									} catch (error) {
										logger.error('Failed to update voice channel name', error as Error, discordContext);
									}
								} else {
									logger.warn('Bot lacks ManageChannels permission for the voice channel', discordContext);
								}
							}
						}
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
						{ name: 'Voice Channel', value: configuration.voiceChannelId ? `<#${configuration.voiceChannelId}>` : 'Not set', inline: true }
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
