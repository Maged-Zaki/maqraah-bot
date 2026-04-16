import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { buildDestructiveConfirmationCustomId, destructiveConfirmationActions } from './destructiveConfirmation';

export function buildDestructiveConfirmationActionRows(confirmationId: string, disabled: boolean = false): ActionRowBuilder<ButtonBuilder>[] {
	const confirmButton = new ButtonBuilder()
		.setCustomId(buildDestructiveConfirmationCustomId(destructiveConfirmationActions.CONFIRM, confirmationId))
		.setLabel('Confirm delete')
		.setStyle(ButtonStyle.Danger)
		.setDisabled(disabled);

	const cancelButton = new ButtonBuilder()
		.setCustomId(buildDestructiveConfirmationCustomId(destructiveConfirmationActions.CANCEL, confirmationId))
		.setLabel('Cancel')
		.setStyle(ButtonStyle.Secondary)
		.setDisabled(disabled);

	return [new ActionRowBuilder<ButtonBuilder>().addComponents(confirmButton, cancelButton)];
}
