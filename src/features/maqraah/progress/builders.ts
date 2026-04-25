export const progressCommandGroup = 'progress';

export const progressSubcommands = {
	UPDATE: 'update',
	SHOW: 'show',
} as const;

export const progressOptions = {
	PAGE: 'page',
	HADITH: 'hadith',
} as const;

export function addProgressSubcommands(builder: any): any {
	return builder
		.addSubcommand((subcommand: any) =>
			subcommand
				.setName(progressSubcommands.UPDATE)
				.setDescription('Update maqraah reading progress')
				.addIntegerOption((option: any) => option.setName(progressOptions.PAGE).setDescription("Current Qur'an page"))
				.addIntegerOption((option: any) => option.setName(progressOptions.HADITH).setDescription('Current Hadith number'))
		)
		.addSubcommand((subcommand: any) => subcommand.setName(progressSubcommands.SHOW).setDescription('Show maqraah progress and setup status'));
}
