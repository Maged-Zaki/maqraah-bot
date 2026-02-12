import { Configuration } from './repositories/ConfigurationRepository';
import { Note } from './repositories/NotesRepository';
import { Progress } from './repositories/ProgressRepository';
import { logger } from './logger';

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

export function buildReminderMessage(configuration: Configuration, progress: Progress, notes: Note[]): string {
	let message = '';
	const nextPage = getNextPage(progress.lastPage);
	const nextHadith = progress.lastHadith + 1;

	message += `<@&${configuration.roleId}> السلام عليكم ورحمة الله وبركاته\n`;
	message += `وقت المقراة اليومية! 📖\n\n`;
	message += `الصفحة القادمة: [${nextPage}](https://quran.com/page/${nextPage})\n`;
	message += `الحديث القادم: **${nextHadith}**\n\n`;

	if (notes.length > 0) {
		message += `ملاحظات اليوم:\n`;
		notes.forEach((note, index) => {
			message += `${index + 1}. ${note.note}\n`;
		});
		message += `\n`;
	}

	return message;
}

/**
 * Builds reminder messages with chunking for Discord's message limits.
 * Returns an array of messages to send if notes exceed the limit.
 * Notes are numbered continuously across chunks.
 * First message includes header, continuation messages only have notes.
 */
export function buildReminderMessages(configuration: Configuration, progress: Progress, notes: Note[]): string[] {
	const messages: string[] = [];

	const nextPage = getNextPage(progress.lastPage);
	const nextHadith = progress.lastHadith + 1;

	const header = `<@&${configuration.roleId}> السلام عليكم ورحمة الله وبركاته\n`;
	const headerWithNotes = header + `وقت المقراة اليومية! 📖\n\n`;
	const pageLink = `الصفحة القادمة: [${nextPage}](https://quran.com/page/${nextPage})\n`;
	const hadithText = `الحديث القادم: **${nextHadith}**\n\n`;
	const notesHeader = `ملاحظات اليوم:\n`;
	const continuationHeader = `ملاحظات اليوم (تتمة):\n`;

	if (notes.length === 0) {
		messages.push(header + pageLink + hadithText);
		return messages;
	}

	logger.debug(`Processing ${notes.length} notes for reminder messages`, undefined, { additionalData: { noteCount: notes.length } });

	// Build the first message with header
	let firstMessage = headerWithNotes + pageLink + hadithText + notesHeader;
	// Continuation messages only have continuation header
	let currentMessage = firstMessage;
	let noteNumber = 1;

	for (const note of notes) {
		const noteLine = `${noteNumber}. ${note.note}\n`;

		logger.debug(`Note ${noteNumber}: length=${noteLine.length}, currentMessage.length=${currentMessage.length}`, undefined, {
			additionalData: { noteNumber, noteLength: noteLine.length, currentMessageLength: currentMessage.length },
		});

		// If single note line exceeds 1900 chars, split it
		if (noteLine.length > 1900) {
			// Save current message first if not empty
			if (currentMessage.length > firstMessage.length) {
				messages.push(currentMessage);
			}
			// Split the long note into chunks (each with just the note number)
			const noteChunks = chunkContent(note.note, 1800);
			for (const chunk of noteChunks) {
				messages.push(header + continuationHeader + `${noteNumber}. ${chunk}\n`);
			}
			currentMessage = firstMessage; // Reset to start fresh
		} else if (currentMessage.length + noteLine.length > 1900) {
			// Save current message and start a new one
			logger.debug(`Splitting at note ${noteNumber}, currentMessage.length=${currentMessage.length}`, undefined, {
				additionalData: { splitNoteNumber: noteNumber, messageLength: currentMessage.length },
			});
			messages.push(currentMessage);
			currentMessage = header + continuationHeader + noteLine;
		} else {
			currentMessage += noteLine;
		}

		noteNumber++;
	}

	messages.push(currentMessage);
	logger.debug(`Generated ${messages.length} messages for ${notes.length} notes`, undefined, {
		additionalData: { messageCount: messages.length, noteCount: notes.length },
	});
	return messages;
}
