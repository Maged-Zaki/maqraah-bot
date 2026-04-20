import { configurationRepository } from '../../storage/sqlite';
import { normalizeTimeZone } from '../../shared/time';

export interface ScheduleDisplayContext {
	timezone: string | null;
	warnings: string[];
}

export async function getScheduleDisplayContext(interaction: any): Promise<ScheduleDisplayContext> {
	const configuration = await configurationRepository.getConfiguration();
	const timezone = normalizeTimeZone(configuration.timezone);
	const warnings: string[] = [];

	if (!timezone) {
		warnings.push(`Timezone is invalid: ${configuration.timezone || 'not set'}.`);
	}

	const channelId = process.env.CHANNEL_ID;
	if (!channelId) {
		warnings.push('Reminder channel is not configured.');
	} else {
		const channel = interaction.client?.channels?.cache?.get(channelId) ?? interaction.guild?.channels?.cache?.get(channelId);
		if (!channel) {
			warnings.push(`Configured reminder channel ${channelId} was not found in cache.`);
		} else if (typeof channel.send !== 'function') {
			warnings.push(`Configured reminder channel ${channelId} is not sendable.`);
		}
	}

	return { timezone, warnings };
}
