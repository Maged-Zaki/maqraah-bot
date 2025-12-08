import { SlashCommandBuilder, ChannelType, MessageFlags } from 'discord.js';
import { updateConfig, getConfig } from '../database';
import { scheduleReminder } from '../scheduler';

export const data = new SlashCommandBuilder()
	.setName('configure')
	.setDescription('Configure MaqraahBot settings')
	.addRoleOption((option) => option.setName('role').setDescription('Role to ping for reminders'))
	.addChannelOption((option) =>
		option.setName('voicechannel').setDescription('Voice channel to update with time').addChannelTypes(ChannelType.GuildVoice)
	)
	.addStringOption((option) => option.setName('time').setDescription('Daily reminder time (HH:MM AM/PM)'))
	.addStringOption((option) => option.setName('timezone').setDescription('Timezone for reminders (e.g., Africa/Cairo)'));

export async function execute(interaction: any) {
	const updates: any = {};
	let replyMessages: string[] = [];

	const role = interaction.options.getRole('role');
	if (role) {
		updates.roleId = role.id;
		replyMessages.push(`Role set to ${role}.`);
	}

	const voicechannel = interaction.options.getChannel('voicechannel');
	if (voicechannel) {
		updates.voiceChannelId = voicechannel.id;
		replyMessages.push(`Voice channel set to ${voicechannel}.`);
	}

	const time = interaction.options.getString('time');
	if (time) {
		const timeRegex = /^\d{1,2}:\d{2} (AM|PM)$/i;
		if (!timeRegex.test(time)) {
			await interaction.reply({
				content: 'Invalid time format. Please use HH:MM AM/PM format, e.g., "12:00 AM".',
				flags: MessageFlags.Ephemeral,
			});
			return;
		}
		updates.dailyTime = time;
		replyMessages.push(`Daily reminder time set to ${time}.`);
	}

	const timezone = interaction.options.getString('timezone');
	if (timezone) {
		updates.timezone = timezone;
		replyMessages.push(`Timezone set to ${timezone}.`);
	}

	if (Object.keys(updates).length > 0) {
		await updateConfig(updates);

		// If time or timezone or role updated, reschedule
		if (updates.dailyTime || updates.timezone || updates.roleId) {
			scheduleReminder(interaction.client);
		}

		// If time updated, update voice channel name
		if (updates.dailyTime) {
			const config = await getConfig();
			if (config.voiceChannelId) {
				const vc = interaction.guild?.channels.cache.get(config.voiceChannelId);
				if (vc && vc.isVoiceBased()) {
					const permissions = vc.permissionsFor(interaction.client.user!);
					if (permissions?.has('ManageChannels')) {
						try {
							const timeWithoutAmpm = time.replace(/\s*(AM|PM)$/i, '');
							await vc.setName(`مقراة الساعة ${timeWithoutAmpm}`);
						} catch (error) {
							console.error('Failed to update voice channel name:', error);
						}
					} else {
						console.error('Bot lacks ManageChannels permission for the voice channel.');
					}
				}
			}
		}

		await interaction.reply(replyMessages.join('\n'));
	} else {
		await interaction.reply({ content: 'No options provided.', flags: MessageFlags.Ephemeral });
	}
}
