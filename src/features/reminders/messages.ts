import { Configuration } from '../../storage/sqlite/repositories/ConfigurationRepository';
import { Note } from '../../storage/sqlite/repositories/NotesRepository';
import { Progress } from '../../storage/sqlite/repositories/ProgressRepository';
import { chunkContent } from '../../shared/content/chunkContent';
import { getNextPage } from '../../shared/quran/pages';
import { defaultReminderCadence, getReminderOffset } from './cadence';

export interface ReminderMessages {
	mainMessage: string;
	notesMessages: string[];
}

export function buildReminderMessages(configuration: Configuration, progress: Progress, notes: Note[]): ReminderMessages {
	return {
		mainMessage: buildMainReminderMessage(configuration, progress),
		notesMessages: buildNotesMessages(notes),
	};
}

export function buildPreReminderMessage(configuration: Configuration): string {
	const offset = getReminderOffset(configuration.preReminderOffsetMinutes, defaultReminderCadence.preReminderOffsetMinutes);
	return `<@&${configuration.roleId}> السلام عليكم ورحمة الله وبركاته\nالمقراة اليومية بعد ${offset} دقائق إن شاء الله.`;
}

function buildMainReminderMessage(configuration: Configuration, progress: Progress): string {
	const nextPage = getNextPage(progress.lastPage);
	const nextHadith = progress.lastHadith + 1;

	let message = `<@&${configuration.roleId}> السلام عليكم ورحمة الله وبركاته\n`;
	message += `وقت المقراة اليومية! 📖\n\n`;
	message += `الصفحة القادمة: [${nextPage}](https://quran.com/page/${nextPage})\n`;
	message += `الحديث القادم: **${nextHadith}**\n`;

	return message;
}

function buildNotesMessages(notes: Note[]): string[] {
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
