export const hifzProgressCommandGroup = 'progress';

export const hifzProgressSubcommands = {
	UPDATE: 'update',
	SHOW: 'show',
	POST_CURRENT_PAGE: 'post-current-page',
} as const;

export const hifzProgressOptions = {
	PAGE: 'page',
} as const;

export function addHifzProgressSubcommands(builder: any): any {
	return builder
		.addSubcommand((subcommand: any) =>
			subcommand
				.setName(hifzProgressSubcommands.UPDATE)
				.setDescription('Update hifz (memorization) progress')
				.addIntegerOption((option: any) => option.setName(hifzProgressOptions.PAGE).setDescription("Current memorization Qur'an page"))
		)
		.addSubcommand((subcommand: any) => subcommand.setName(hifzProgressSubcommands.SHOW).setDescription('Show hifz progress and setup status'))
		.addSubcommand((subcommand: any) =>
			subcommand.setName(hifzProgressSubcommands.POST_CURRENT_PAGE).setDescription("Post the current hifz memorization page prompt")
		);
}
