import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { logger, DiscordContext } from '../../observability/logging/logger';
import { syncMaqraahTimeFromMaghrib } from './maqraahTimeSync';

export const data = new SlashCommandBuilder()
	.setName('sync-maqraah-time')
	.setDescription('Sync the configured maqraah time from today\'s Maghrib prayer time');

export async function execute(interaction: any) {
	const discordContext: DiscordContext = {
		userId: interaction.user.id,
		username: interaction.user.username,
		guildId: interaction.guildId?.toString(),
		channelId: interaction.channelId?.toString(),
		commandName: 'sync-maqraah-time',
	};

	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	try {
		const result = await syncMaqraahTimeFromMaghrib(interaction.client);

		if (!result.enabled) {
			await interaction.editReply('Maqraah time sync is disabled. Enable it with `/configuration update maqraah-time-sync-enabled:true`.');
			return;
		}

		if (!result.timing) {
			await interaction.editReply('Maqraah time sync finished, but no timing details were returned.');
			return;
		}

		const status = result.changed
			? `Synced configured maqraah time to \`${result.timing.reminderTime}\`.`
			: `Configured maqraah time is already synced at \`${result.timing.reminderTime}\`.`;

		await interaction.editReply(
			`${status}\nMaghrib: \`${result.timing.maghribTime}\` on ${result.timing.date}. Five-minute bucket: \`${result.timing.roundedMaghribTime}\`.`
		);
	} catch (error) {
		logger.error('Failed to execute manual maqraah time sync', error as Error, discordContext, {
			operationType: 'maqraah_time_sync_command',
			operationStatus: 'failure',
		});
		await interaction.editReply('Failed to sync the maqraah time from Maghrib. The scheduled checker will keep retrying.');
	}
}
