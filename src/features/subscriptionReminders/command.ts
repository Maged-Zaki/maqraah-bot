import { ChannelType, EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { reminderSettingsRepository } from '../../storage/sqlite';
import { parseReminderTime } from '../../shared/time';
import { logger, type DiscordContext } from '../../observability/logging/logger';
import {
	getSubscriptionReminderCategory,
	subscriptionReminderCategories,
	subscriptionReminderCategoryKeys,
	type SubscriptionReminderCategoryKey,
} from './catalog';
import { isSendableTextChannel } from './channel';
import { ensureCategoryRole, memberHasRole, subscribeMemberToCategory, unsubscribeMemberFromCategory } from './roleManager';
import * as subscriptionReminderScheduler from './scheduler';

const subcommands = {
	SUBSCRIBE: 'subscribe',
	UNSUBSCRIBE: 'unsubscribe',
	LIST: 'list',
} as const;

const subcommandGroups = {
	CONFIGURATION: 'configuration',
} as const;

const configurationSubcommands = {
	SHOW: 'show',
	UPDATE: 'update',
} as const;

const options = {
	CATEGORY: 'category',
	TIME: 'time',
	CHANNEL: 'channel',
} as const;

export const data = new SlashCommandBuilder()
	.setName('reminders')
	.setDescription('Manage optional Islamic reminder subscriptions')
	.addSubcommand((subcommand) =>
		subcommand
			.setName(subcommands.SUBSCRIBE)
			.setDescription('Subscribe to an optional reminder category')
			.addStringOption((option) =>
				option
					.setName(options.CATEGORY)
					.setDescription('Reminder category')
					.setRequired(true)
					.addChoices(
						...subscriptionReminderCategoryKeys.map((categoryKey) => ({
							name: subscriptionReminderCategories[categoryKey].label,
							value: categoryKey,
						}))
					)
			)
	)
	.addSubcommand((subcommand) =>
		subcommand
			.setName(subcommands.UNSUBSCRIBE)
			.setDescription('Unsubscribe from an optional reminder category')
			.addStringOption((option) =>
				option
					.setName(options.CATEGORY)
					.setDescription('Reminder category')
					.setRequired(true)
					.addChoices(
						...subscriptionReminderCategoryKeys.map((categoryKey) => ({
							name: subscriptionReminderCategories[categoryKey].label,
							value: categoryKey,
						}))
					)
			)
	)
	.addSubcommand((subcommand) => subcommand.setName(subcommands.LIST).setDescription('Show your reminder subscriptions'))
	.addSubcommandGroup((group) =>
		group
			.setName(subcommandGroups.CONFIGURATION)
			.setDescription('Manage global reminder configuration')
			.addSubcommand((subcommand) => subcommand.setName(configurationSubcommands.SHOW).setDescription('Show global reminder configuration'))
			.addSubcommand((subcommand) =>
				subcommand
					.setName(configurationSubcommands.UPDATE)
					.setDescription('Update global reminder configuration')
					.addStringOption((option) =>
						option.setName(options.TIME).setDescription('Time of day, e.g. 6:00 PM')
					)
					.addChannelOption((option) =>
						option
							.setName(options.CHANNEL)
							.setDescription('Channel where reminder messages should be sent')
							.addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
					)
			)
	);

export async function execute(interaction: any): Promise<void> {
	const group = getSubcommandGroup(interaction);
	const subcommand = interaction.options.getSubcommand();
	const discordContext: DiscordContext = {
		userId: interaction.user.id,
		username: interaction.user.username,
		guildId: interaction.guildId?.toString(),
		channelId: interaction.channelId?.toString(),
		commandName: 'reminders',
		subcommand: group ? `${group} ${subcommand}` : subcommand,
	};

	logger.info(`Executing reminders command: ${discordContext.subcommand}`, discordContext, { operationType: 'subscription_reminder_command' });

	try {
		if (group === subcommandGroups.CONFIGURATION) {
			await executeConfigurationSubcommand(interaction, subcommand);
			return;
		}

		switch (subcommand) {
			case subcommands.SUBSCRIBE:
				await handleSubscribe(interaction);
				return;
			case subcommands.UNSUBSCRIBE:
				await handleUnsubscribe(interaction);
				return;
			case subcommands.LIST:
				await handleList(interaction);
				return;
			default:
				await interaction.reply({ content: 'Unknown reminders command.', flags: MessageFlags.Ephemeral });
		}
	} catch (error) {
		logger.error('Failed to execute reminders command', error as Error, discordContext, {
			operationType: 'subscription_reminder_command',
			operationStatus: 'failure',
		});
		await interaction.reply({
			content: formatUserFacingError(error),
			flags: MessageFlags.Ephemeral,
		});
	}
}

async function handleSubscribe(interaction: any): Promise<void> {
	const categoryKey = getCategoryKey(interaction);
	const category = getSubscriptionReminderCategory(categoryKey);
	if (!category) {
		await interaction.reply({ content: 'Unknown reminder category.', flags: MessageFlags.Ephemeral });
		return;
	}

	const { changed } = await subscribeMemberToCategory(interaction.guild, interaction.member, category.key);
	await interaction.reply({
		content: changed ? `You are subscribed to ${category.roleName}.` : `You are already subscribed to ${category.roleName}.`,
		flags: MessageFlags.Ephemeral,
	});
}

async function handleUnsubscribe(interaction: any): Promise<void> {
	const categoryKey = getCategoryKey(interaction);
	const category = getSubscriptionReminderCategory(categoryKey);
	if (!category) {
		await interaction.reply({ content: 'Unknown reminder category.', flags: MessageFlags.Ephemeral });
		return;
	}

	const { changed } = await unsubscribeMemberFromCategory(interaction.guild, interaction.member, category.key);
	await interaction.reply({
		content: changed ? `You are unsubscribed from ${category.roleName}.` : `You are not subscribed to ${category.roleName}.`,
		flags: MessageFlags.Ephemeral,
	});
}

async function handleList(interaction: any): Promise<void> {
	const lines = await Promise.all(subscriptionReminderCategoryKeys.map(async (categoryKey) => {
		const category = subscriptionReminderCategories[categoryKey];
		const role = await ensureCategoryRole(interaction.guild, categoryKey, false);
		const subscribed = role ? memberHasRole(interaction.member, role.id) : false;
		return `${subscribed ? 'Subscribed' : 'Not subscribed'}: ${category.roleName}`;
	}));

	await interaction.reply({
		content: lines.join('\n'),
		flags: MessageFlags.Ephemeral,
	});
}

async function executeConfigurationSubcommand(interaction: any, subcommand: string): Promise<void> {
	switch (subcommand) {
		case configurationSubcommands.SHOW:
			await handleConfigurationShow(interaction);
			return;
		case configurationSubcommands.UPDATE:
			await handleConfigurationUpdate(interaction);
			return;
		default:
			await interaction.reply({ content: 'Unknown reminder configuration command.', flags: MessageFlags.Ephemeral });
	}
}

async function handleConfigurationShow(interaction: any): Promise<void> {
	const settings = await reminderSettingsRepository.getSettings();
	const embed = new EmbedBuilder()
		.setTitle('Reminder Configuration')
		.addFields(
			{ name: 'Send time', value: settings.sendTime, inline: true },
			{ name: 'Channel', value: settings.channelId ? `<#${settings.channelId}>` : 'Not set', inline: true }
		)
		.setColor(0x0099ff);

	await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function handleConfigurationUpdate(interaction: any): Promise<void> {
	const time = interaction.options.getString(options.TIME);
	const channel = interaction.options.getChannel(options.CHANNEL);
	const updates: { sendTime?: string; channelId?: string } = {};

	if (time !== null) {
		const parsedTime = parseReminderTime(time);
		if (!parsedTime) {
			await interaction.reply({ content: 'Invalid time. Please use `H:MM AM/PM`, such as `6:00 PM`.', flags: MessageFlags.Ephemeral });
			return;
		}
		updates.sendTime = parsedTime.displayTime;
	}

	if (channel !== null) {
		if (!isSendableTextChannel(channel)) {
			await interaction.reply({ content: 'Invalid channel. Please choose a text channel I can send messages in.', flags: MessageFlags.Ephemeral });
			return;
		}
		updates.channelId = channel.id;
	}

	if (Object.keys(updates).length === 0) {
		await interaction.reply({ content: 'No configuration options provided.', flags: MessageFlags.Ephemeral });
		return;
	}

	const settings = await reminderSettingsRepository.updateSettings(updates);
	await subscriptionReminderScheduler.scheduleSubscriptionReminders(interaction.client);

	await interaction.reply({
		content: [`Reminder configuration updated.`, `Send time: ${settings.sendTime}`, `Channel: <#${settings.channelId}>`].join(
			'\n'
		),
		flags: MessageFlags.Ephemeral,
	});
}

function getSubcommandGroup(interaction: any): string | null {
	if (typeof interaction.options.getSubcommandGroup !== 'function') {
		return null;
	}

	return interaction.options.getSubcommandGroup(false);
}

function getCategoryKey(interaction: any): SubscriptionReminderCategoryKey | null {
	const category = interaction.options.getString(options.CATEGORY);
	return getSubscriptionReminderCategory(category)?.key ?? null;
}

function formatUserFacingError(error: unknown): string {
	if (error instanceof Error && (error.message.includes('Manage Roles') || error.message.includes('highest role'))) {
		return error.message;
	}

	return 'There was an error executing this command!';
}
