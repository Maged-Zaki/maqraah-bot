import { EmbedBuilder, MessageFlags } from 'discord.js';
import type { Schedule } from '../../storage/sqlite/repositories/ScheduleRepository';
import { scheduleTypes } from '../../storage/sqlite/repositories/ScheduleRepository';
import { formatScheduleRun, formatWeekdays, getNextScheduleRuns, parseStoredWeekdays } from './resolver';

interface ScheduleReplyOptions {
	schedule: Schedule;
	timezone: string | null;
	warnings?: string[];
	now?: Date;
	title?: string;
}

interface ScheduleListReplyOptions {
	schedules: Schedule[];
	timezone: string | null;
	warnings?: string[];
	now?: Date;
}

export function buildScheduleSavedReply(options: ScheduleReplyOptions) {
	const embed = buildScheduleEmbed({
		...options,
		title: options.title ?? 'Schedule Saved',
		includeMessage: true,
	});

	return {
		embeds: [embed],
		flags: MessageFlags.Ephemeral,
	};
}

export function buildScheduleShowReply(options: ScheduleReplyOptions) {
	const embed = buildScheduleEmbed({
		...options,
		title: options.title ?? options.schedule.name,
		includeMessage: true,
	});

	return {
		embeds: [embed],
		flags: MessageFlags.Ephemeral,
	};
}

export function buildScheduleListReply(options: ScheduleListReplyOptions) {
	const warnings = options.warnings ?? [];
	const embed = new EmbedBuilder().setTitle('Schedules').setColor(warnings.length > 0 ? 0xffcc00 : 0x0099ff);

	if (options.schedules.length === 0) {
		embed.setDescription('No active schedules yet.');
	} else {
		const visibleSchedules = options.schedules.slice(0, 10);
		for (const schedule of visibleSchedules) {
			const nextRun = getNextScheduleRuns(schedule, options.timezone, 1, options.now)[0];
			embed.addFields({
				name: schedule.name,
				value: [
					`When: ${formatScheduleTiming(schedule)}`,
					`Next: ${nextRun ? formatScheduleRun(nextRun) : 'Not available'}`,
					`Message: ${previewText(schedule.message, 140)}`,
				].join('\n'),
				inline: false,
			});
		}

		if (options.schedules.length > visibleSchedules.length) {
			embed.setFooter({ text: `Showing 10 of ${options.schedules.length} active schedules.` });
		}
	}

	if (warnings.length > 0) {
		embed.addFields({ name: 'Warnings', value: warnings.map((warning) => `- ${warning}`).join('\n'), inline: false });
	}

	return {
		embeds: [embed],
		flags: MessageFlags.Ephemeral,
	};
}

export function formatScheduleTiming(schedule: Schedule): string {
	if (schedule.type === scheduleTypes.ONE_TIME) {
		return `${schedule.oneTimeDate ?? 'Unknown date'} at ${schedule.time}`;
	}

	const weekdays = parseStoredWeekdays(schedule.weekdays);
	return `${formatWeekdays(weekdays)} at ${schedule.time}`;
}

function buildScheduleEmbed(options: ScheduleReplyOptions & { includeMessage: boolean }) {
	const warnings = options.warnings ?? [];
	const nextRuns = getNextScheduleRuns(options.schedule, options.timezone, 3, options.now);
	const embed = new EmbedBuilder()
		.setTitle(options.title ?? options.schedule.name)
		.addFields(
			{ name: 'Name', value: options.schedule.name, inline: true },
			{ name: 'Type', value: formatScheduleType(options.schedule), inline: true },
			{ name: 'When', value: formatScheduleTiming(options.schedule), inline: false },
			{
				name: 'Next Runs',
				value: nextRuns.length > 0 ? nextRuns.map(formatScheduleRun).join('\n') : 'Not available',
				inline: false,
			}
		)
		.setColor(warnings.length > 0 ? 0xffcc00 : 0x0099ff);

	if (options.includeMessage) {
		embed.addFields({ name: 'Message', value: previewText(options.schedule.message, 900), inline: false });
	}

	if (warnings.length > 0) {
		embed.addFields({ name: 'Warnings', value: warnings.map((warning) => `- ${warning}`).join('\n'), inline: false });
	}

	return embed;
}

function formatScheduleType(schedule: Schedule): string {
	return schedule.type === scheduleTypes.ONE_TIME ? 'One-time' : 'Recurring';
}

function previewText(value: string, maxLength: number): string {
	const trimmedValue = value.trim();
	if (trimmedValue.length <= maxLength) {
		return trimmedValue;
	}

	return `${trimmedValue.slice(0, maxLength - 3)}...`;
}
