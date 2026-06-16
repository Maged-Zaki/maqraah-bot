import type { Configuration } from '../../../storage/sqlite/repositories/ConfigurationRepository';
import type { Note } from '../../../storage/sqlite/repositories/NotesRepository';
import type { HifzProgress } from '../../../storage/sqlite/repositories/HifzProgressRepository';
import { chunkContent } from '../../../shared/content/chunkContent';
import { defaultHifzCadence, getHifzReminderOffset } from './cadence';
import { DEFAULT_HIFZ_TIME } from './sessionId';
import { resolveHifzRoleId } from '../role';

export interface HifzReminderMessages {
	mainMessage: string;
	notesMessages: string[];
}

export function buildHifzReminderMessages(configuration: Configuration, progress: HifzProgress, notes: Note[]): HifzReminderMessages {
	return {
		mainMessage: buildMainHifzReminderMessage(configuration, progress),
		notesMessages: buildHifzNotesMessages(notes),
	};
}

export function buildPreHifzReminderMessage(configuration: Configuration): string {
	const offset = getHifzReminderOffset(configuration.hifzPreReminderOffsetMinutes, defaultHifzCadence.preReminderOffsetMinutes);
	const roleId = resolveHifzRoleId(configuration);
	return `<@&${roleId}> السلام عليكم ورحمة الله وبركاته\nحلقة الحفظ بعد ${offset} دقائق إن شاء الله.`;
}

function buildMainHifzReminderMessage(configuration: Configuration, progress: HifzProgress): string {
	const roleId = resolveHifzRoleId(configuration);
	let message = `<@&${roleId}> بدأت حلقة الحفظ\n\n`;
	message += `صفحة الحفظ النهارده: [${progress.currentPage}](https://quran.com/page/${progress.currentPage})\n`;

	return message;
}

function buildHifzNotesMessages(notes: Note[]): string[] {
	if (notes.length === 0) {
		return [];
	}

	const messages: string[] = [];
	const notesHeader = `ملاحظات اليوم:\n`;

	let currentMessage = notesHeader;
	let noteNumber = 1;

	for (const note of notes) {
		const noteLine = `${noteNumber}. ${note.note}\n`;

		if (noteLine.length > 1900) {
			if (currentMessage.length > notesHeader.length) {
				messages.push(currentMessage);
			}

			const noteChunks = chunkContent(note.note, 1800);
			for (const chunk of noteChunks) {
				messages.push(`${noteNumber}. ${chunk}\n`);
			}
			currentMessage = notesHeader;
		} else if (currentMessage.length + noteLine.length > 1900) {
			messages.push(currentMessage);
			currentMessage = noteLine;
		} else {
			currentMessage += noteLine;
		}

		noteNumber++;
	}

	if (currentMessage.length > notesHeader.length) {
		messages.push(currentMessage);
	}

	return messages;
}

export { DEFAULT_HIFZ_TIME };
