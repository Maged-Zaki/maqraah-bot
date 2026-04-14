/**
 * Splits content into chunks that fit within Discord's message limits.
 *
 * Discord limits:
 * - Embed description: 4096 characters
 * - Regular message: 2000 characters
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
