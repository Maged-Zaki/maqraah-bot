import { Config, Note } from './database';

export function getNextPage(lastPage: number): number {
	return lastPage === 604 ? 1 : lastPage + 1;
}

export function buildReminderMessage(config: Config, nextPage: number, notes: Note[], mentionRole: boolean): string {
	let message = `${mentionRole ? `<@&${config.roleId}>` : ''} 📢\nPage: [${nextPage}](https://quran.com/page/${nextPage})\nHadith: ${
		config.lastHadith + 1
	}`;

	if (notes.length > 0) {
		message += '\n\nNotes:';
		for (const note of notes) {
			message += `\n<@${note.userId}>: ${note.note}`;
		}
	}

	return message;
}
