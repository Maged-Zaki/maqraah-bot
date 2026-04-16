import { Client } from 'discord.js';
import { configurationRepository } from '../../storage/sqlite';
import { sendFirstRunSetupGuide } from './firstRun';

export async function sendFirstRunSetupGuideFromConfig(client: Client): Promise<void> {
	await sendFirstRunSetupGuide(client, configurationRepository);
}
