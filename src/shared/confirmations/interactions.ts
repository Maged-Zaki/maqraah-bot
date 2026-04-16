import { ButtonInteraction, MessageFlags } from 'discord.js';
import {
	destructiveConfirmationActions,
	destructiveConfirmationStore,
	parseDestructiveConfirmationCustomId,
} from './destructiveConfirmation';

export async function handleDestructiveConfirmationButtonInteraction(interaction: ButtonInteraction): Promise<boolean> {
	const parsedCustomId = parseDestructiveConfirmationCustomId(interaction.customId);
	if (!parsedCustomId) {
		return false;
	}

	try {
		const result =
			parsedCustomId.action === destructiveConfirmationActions.CONFIRM
				? await destructiveConfirmationStore.confirm(parsedCustomId.confirmationId, interaction.user.id)
				: await destructiveConfirmationStore.cancel(parsedCustomId.confirmationId, interaction.user.id);

		if (result.status === 'unauthorized') {
			await interaction.reply({
				content: `Only <@${result.ownerUserId}> can respond to this confirmation.`,
				flags: MessageFlags.Ephemeral,
			});
			return true;
		}

		await interaction.update({
			content: result.content,
			components: [],
		});
	} catch {
		await replyWithError(interaction);
	}

	return true;
}

async function replyWithError(interaction: ButtonInteraction): Promise<void> {
	const errorReply = { content: 'There was an error handling this confirmation. No changes were made.', flags: MessageFlags.Ephemeral as const };

	if (interaction.replied || interaction.deferred) {
		await interaction.followUp(errorReply);
		return;
	}

	await interaction.reply(errorReply);
}
