import { Configuration } from './repositories/ConfigurationRepository';
import { Note } from './repositories/NotesRepository';
import { Progress } from './repositories/ProgressRepository';

export function getNextPage(lastPage: number): number {
	if (lastPage >= 604) {
		return 1;
	}
	return lastPage + 1;
}

/**
 * Splits content into chunks that fit within Discord's message limits.
 * Discord limits:
 * - Embed description: 4096 characters
 * - Regular message: 2000 characters
 *
 * @param content The content to split
 * @param maxLength Maximum length per chunk (default 1900 for safety margin)
 * @param separator Line separator to use between chunks
 * @returns Array of content chunks
 */
export function chunkContent(content: string, maxLength: number = 1900, separator: string = '\n'): string[] {
	if (content.length <= maxLength) {
		return [content];
	}

	const chunks: string[] = [];
	const lines = content.split(separator);
	let currentChunk = '';

	for (const line of lines) {
		if (currentChunk.length + line.length + separator.length <= maxLength) {
			currentChunk += (currentChunk ? separator : '') + line;
		} else {
			if (currentChunk) {
				chunks.push(currentChunk);
			}
			// If single line exceeds maxLength, split it
			if (line.length > maxLength) {
				const lineChunks = splitLongLine(line, maxLength);
				chunks.push(...lineChunks);
				currentChunk = '';
			} else {
				currentChunk = line;
			}
		}
	}

	if (currentChunk) {
		chunks.push(currentChunk);
	}

	return chunks;
}

function splitLongLine(line: string, maxLength: number): string[] {
	const chunks: string[] = [];
	for (let i = 0; i < line.length; i += maxLength) {
		chunks.push(line.substring(i, i + maxLength));
	}
	return chunks;
}

/**
 * Builds the main reminder message with role mention and core info.
 * This message is sent first and contains the ping.
 */
export function buildMainReminderMessage(configuration: Configuration, progress: Progress): string {
	const nextPage = getNextPage(progress.lastPage);
	const nextHadith = progress.lastHadith + 1;

	let message = `<@&${configuration.roleId}> السلام عليكم ورحمة الله وبركاته\n`;
	message += `وقت المقراة اليومية! 📖\n\n`;
	message += `الصفحة القادمة: [${nextPage}](https://quran.com/page/${nextPage})\n`;
	message += `الحديث القادم: **${nextHadith}**\n`;

	return message;
}

/**
 * Builds notes messages without any role mentions.
 * Returns an array of messages that can be sent after the main reminder.
 * First message has "ملاحظات اليوم:" header, continuations have "تكملة:" header.
 */
export function buildNotesMessages(notes: Note[]): string[] {
	if (notes.length === 0) {
		return [];
	}

	const messages: string[] = [];
	const notesHeader = `ملاحظات اليوم:\n`;

	let currentMessage = notesHeader;
	let noteNumber = 1;

	for (const note of notes) {
		const noteLine = `${noteNumber}. ${note.note}\n`;

		// If single note line exceeds 1900 chars, split it
		if (noteLine.length > 1900) {
			// Save current message first if it has content beyond the header
			if (currentMessage.length > notesHeader.length) {
				messages.push(currentMessage);
			}
			// Split the long note into chunks
			const noteChunks = chunkContent(note.note, 1800);
			for (const chunk of noteChunks) {
				messages.push(`${noteNumber}. ${chunk}\n`);
			}
			currentMessage = notesHeader; // Reset to start fresh
		} else if (currentMessage.length + noteLine.length > 1900) {
			// Save current message and start a new one
			messages.push(currentMessage);
			currentMessage = noteLine;
		} else {
			currentMessage += noteLine;
		}

		noteNumber++;
	}

	// Don't push empty message (just header with no notes)
	if (currentMessage.length > notesHeader.length) {
		messages.push(currentMessage);
	}

	return messages;
}

/**
 * Result of building reminder messages.
 * mainMessage: The primary reminder with role mention (always sent first)
 * notesMessages: Array of notes messages (can be empty if no notes)
 */
export interface ReminderMessages {
	mainMessage: string;
	notesMessages: string[];
}

/**
 * Builds reminder messages separated into main message and notes messages.
 * The main message contains the role mention and core info.
 * Notes messages are separate and contain no mentions.
 *
 * @param configuration The configuration containing role ID
 * @param progress The progress containing last page and hadith
 * @param notes Array of notes to include
 * @returns Object with mainMessage and notesMessages array
 */
export function buildReminderMessages(configuration: Configuration, progress: Progress, notes: Note[]): ReminderMessages {
	return {
		mainMessage: buildMainReminderMessage(configuration, progress),
		notesMessages: buildNotesMessages(notes),
	};
}
