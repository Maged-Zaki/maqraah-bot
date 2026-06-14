import { EmbedBuilder, MessageFlags, PermissionsBitField } from 'discord.js';
import type { Configuration } from '../../../storage/sqlite/repositories/ConfigurationRepository';
import type { HifzProgress } from '../../../storage/sqlite/repositories/HifzProgressRepository';
import { TOTAL_QURAN_PAGES } from '../../../shared/quran/progress';
import { normalizeTimeZone, parseReminderTime } from '../../../shared/time';
import { defaultHifzCadence, isHifzReminderStageEnabled } from '../reminders/cadence';
import { getUpcomingHifzSessionId } from '../reminders/sessionId';

interface HifzProgressDashboardInput {
	configuration: Configuration;
	progress: HifzProgress;
	pendingNoteCount: number;
	interaction: any;
	now?: Date;
}

interface ResolvedDisplay {
	value: string;
	warnings: string[];
}

export function buildHifzProgressDashboardReply(input: HifzProgressDashboardInput) {
	const warnings: string[] = [];
	const timezone = normalizeTimeZone(input.configuration.timezone);
	const hifzTime = input.configuration.hifzTime ?? '6:00 PM';
	const parsedTime = parseReminderTime(hifzTime);
	const guild = getGuild(input.interaction);

	if (!parsedTime) {
		warnings.push(`Hifz time is invalid: ${formatRawValue(hifzTime)}.`);
	}

	if (!timezone) {
		warnings.push(`Timezone is invalid: ${formatRawValue(input.configuration.timezone)}.`);
	}

	if (!isHifzReminderStageEnabled(input.configuration.hifzReminderEnabled, defaultHifzCadence.mainReminderEnabled)) {
		warnings.push('Hifz reminders are disabled.');
	}

	const roleDisplay = resolveRoleDisplay(input.configuration.roleId, guild);
	warnings.push(...roleDisplay.warnings);

	const reminderChannelDisplay = resolveReminderChannelDisplay(input.interaction);
	warnings.push(...reminderChannelDisplay.warnings);

	const nextHifz = parsedTime && timezone ? formatNextHifz(hifzTime, timezone, input.now) : 'Not available';
	const currentPage = Number.isInteger(input.progress.currentPage) ? input.progress.currentPage : 1;

	const embed = new EmbedBuilder()
		.setTitle('Hifz Progress')
		.addFields(
			{
				name: 'Memorization Progress',
				value: `Current page: ${currentPage} / ${TOTAL_QURAN_PAGES}`,
				inline: true,
			},
			{ name: 'Next Hifz', value: nextHifz, inline: false },
			{ name: 'Reminder Channel', value: reminderChannelDisplay.value, inline: true },
			{ name: 'Reminder Role', value: roleDisplay.value, inline: true },
			{ name: 'Pending Notes', value: formatPendingNoteCount(input.pendingNoteCount), inline: true },
			{ name: 'Warnings', value: warnings.length > 0 ? warnings.map((warning) => `- ${warning}`).join('\n') : 'None', inline: false }
		)
		.setColor(warnings.length > 0 ? 0xffcc00 : 0x0099ff);

	return {
		embeds: [embed],
		flags: MessageFlags.Ephemeral,
		allowedMentions: { parse: [] as string[] },
	};
}

function formatNextHifz(hifzTime: string, timezone: string, now: Date = new Date()): string {
	const sessionId = getUpcomingHifzSessionId({ hifzTime, timezone }, now);
	if (!sessionId) {
		return 'Not available';
	}

	return `${sessionId} at ${hifzTime} (${timezone})`;
}

function resolveRoleDisplay(roleId: string | null | undefined, guild: any): ResolvedDisplay {
	if (!isConfiguredValue(roleId)) {
		return {
			value: 'Not set',
			warnings: ['Reminder role is not configured.'],
		};
	}

	const role = guild?.roles?.cache?.get(roleId);
	if (!role) {
		return {
			value: formatRoleMention(roleId),
			warnings: [`Configured role ${roleId} was not found in cache.`],
		};
	}

	return {
		value: formatRoleMention(role.id ?? roleId),
		warnings: [],
	};
}

function resolveReminderChannelDisplay(interaction: any): ResolvedDisplay {
	const channelId = process.env.CHANNEL_ID;
	if (!isConfiguredValue(channelId)) {
		return {
			value: 'Not set',
			warnings: ['Reminder channel is not configured.'],
		};
	}

	const channel = getChannel(interaction, channelId);
	if (!channel) {
		return {
			value: formatChannelMention(channelId),
			warnings: [`Configured reminder channel ${channelId} was not found in cache.`],
		};
	}

	const warnings: string[] = [];
	if (typeof channel.send !== 'function') {
		warnings.push(`Configured reminder channel ${channelId} is not sendable.`);
	}

	const permissions = getPermissions(channel, interaction.client?.user);
	if (permissions) {
		if (!permissions.has(PermissionsBitField.Flags.ViewChannel)) {
			warnings.push(`Missing View Channel permission in reminder channel ${channelId}.`);
		}
		if (!permissions.has(PermissionsBitField.Flags.SendMessages)) {
			warnings.push(`Missing Send Messages permission in reminder channel ${channelId}.`);
		}
	}

	return {
		value: formatChannelDisplay(channel, channelId),
		warnings,
	};
}

function getGuild(interaction: any): any {
	if (interaction.guild) {
		return interaction.guild;
	}

	const guildId = interaction.guildId ?? process.env.GUILD_ID;
	return guildId ? interaction.client?.guilds?.cache?.get(guildId) : undefined;
}

function getChannel(interaction: any, channelId: string): any {
	return interaction.client?.channels?.cache?.get(channelId) ?? getGuild(interaction)?.channels?.cache?.get(channelId);
}

function getPermissions(channel: any, user: any): PermissionsBitField | null {
	if (!user || typeof channel.permissionsFor !== 'function') {
		return null;
	}

	const permissions = channel.permissionsFor(user);
	return permissions && typeof permissions.has === 'function' ? permissions : null;
}

function formatChannelDisplay(channel: any, fallbackId: string): string {
	const id = channel.id ?? fallbackId;
	return formatChannelMention(id);
}

function formatChannelMention(channelId: string): string {
	return `<#${channelId}>`;
}

function formatRoleMention(roleId: string): string {
	return `<@&${roleId}>`;
}

function formatPendingNoteCount(count: number): string {
	return count === 1 ? '1 pending note' : `${count} pending notes`;
}

function isConfiguredValue(value: string | null | undefined): value is string {
	if (!value) {
		return false;
	}

	const trimmedValue = value.trim();
	return trimmedValue.length > 0 && trimmedValue.toLowerCase() !== 'not set';
}

function formatRawValue(value: string | null | undefined): string {
	return value && value.trim().length > 0 ? `\`${value}\`` : 'not set';
}
