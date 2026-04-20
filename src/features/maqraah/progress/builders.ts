export const progressCommandGroup = 'progress';

export const progressSubcommands = {
	UPDATE: 'update',
	SHOW: 'show',
} as const;

export const progressOptions = {
	LAST_QURAN_PAGE_READ: 'last-quran-page-read',
	LAST_HADITH: 'last-hadith',
} as const;

export function addProgressSubcommands(builder: any): any {
	return builder
		.addSubcommand((subcommand: any) =>
			subcommand
				.setName(progressSubcommands.UPDATE)
				.setDescription('Update maqraah reading progress')
				.addIntegerOption((option: any) => option.setName(progressOptions.LAST_QURAN_PAGE_READ).setDescription("Last Qur'an page you've read"))
				.addIntegerOption((option: any) => option.setName(progressOptions.LAST_HADITH).setDescription('Last Hadith read'))
		)
		.addSubcommand((subcommand: any) => subcommand.setName(progressSubcommands.SHOW).setDescription('Show maqraah progress and setup status'));
}
