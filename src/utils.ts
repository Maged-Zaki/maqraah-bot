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
 */
export function buildReminderMessages(configuration: Configuration, progress: Progress, notes: Note[]): string[] {
	const messages: string[] = [];

	const nextPage = getNextPage(progress.lastPage);
	const nextHadith = progress.lastHadith + 1;

	let header = `<@&${configuration.roleId}> السلام عليكم ورحمة الله وبركاته\n`;
	header += `وقت المقراة اليومية! 📖\n\n`;
	header += `الصفحة القادمة: [${nextPage}](https://quran.com/page/${nextPage})\n`;
	header += `الحديث القادم: **${nextHadith}**\n\n`;

	if (notes.length === 0) {
		messages.push(header);
		return messages;
	}

	// Build notes content with continuous numbering
	const maxHeaderLength = header.length + 20; // Header + "ملاحظات اليوم:" + buffer
	const maxNoteLength = 1900 - maxHeaderLength;

	let currentMessage = header + `ملاحظات اليوم:\n`;
	let noteNumber = 1;

	for (const note of notes) {
		const noteLine = `${noteNumber}. ${note.note}\n`;

		if (currentMessage.length + noteLine.length > 1900) {
			// Save current message and start a new one
			messages.push(currentMessage);
			currentMessage = header + `ملاحظات اليوم (${noteNumber}/${notes.length}):\n` + noteLine;
		} else {
			currentMessage += noteLine;
		}

		noteNumber++;
	}

	messages.push(currentMessage);
	return messages;
}
