import { Guild } from 'discord.js';
import { defaultSetupGuideCommandReferences, SetupGuideCommandReferences } from './messages';

export function resolveSetupGuideCommandReferences(guild?: Guild | null): SetupGuideCommandReferences {
	return {
		configurationUpdate: withCommandId(defaultSetupGuideCommandReferences.configurationUpdate, guild),
		progressUpdate: withCommandId(defaultSetupGuideCommandReferences.progressUpdate, guild),
		help: withCommandId(defaultSetupGuideCommandReferences.help, guild),
	};
}

function withCommandId(command: { name: string; subcommand?: string }, guild?: Guild | null): { name: string; subcommand?: string; id?: string } {
	const registeredCommand = guild?.commands.cache.find((candidate) => candidate.name === command.name);
	return {
		...command,
		id: registeredCommand?.id,
	};
}
