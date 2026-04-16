type CommandReference = {
	name: string;
	subcommand?: string;
	id?: string;
};

export type SetupGuideCommandReferences = {
	configurationUpdate: CommandReference;
	progressUpdate: CommandReference;
	help: CommandReference;
};

export const defaultSetupGuideCommandReferences: SetupGuideCommandReferences = {
	configurationUpdate: { name: 'configuration', subcommand: 'update' },
	progressUpdate: { name: 'progress', subcommand: 'update' },
	help: { name: 'help' },
};

export function buildSetupGuideMessage(commandReferences: SetupGuideCommandReferences = defaultSetupGuideCommandReferences): string {
	const configurationUpdate = formatCommandReference(commandReferences.configurationUpdate);
	const progressUpdate = formatCommandReference(commandReferences.progressUpdate);
	const help = formatCommandReference(commandReferences.help);

	return [
		"Hello! I am the Maqraah bot. I help your group track daily Qur'an and Hadith reading.",
		'',
		`Start with ${configurationUpdate} to choose the reminder role, maqraah time, timezone, and voice channel.`,
		`Use ${progressUpdate} to record the current Qur'an page and Hadith number.`,
		`Use ${help} any time you need the command list.`,
		'',
		"Once setup is ready, I will send the daily Maqraah reminders here, insha'Allah.",
	].join('\n');
}

function formatCommandReference(command: CommandReference): string {
	const commandPath = [command.name, command.subcommand].filter(Boolean).join(' ');

	if (command.id) {
		return `</${commandPath}:${command.id}>`;
	}

	return `\`/${commandPath}\``;
}
