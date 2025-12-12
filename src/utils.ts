import { Configuration } from './repositories/ConfigurationRepository';
import { Note } from './repositories/NotesRepository';
import { Progress } from './repositories/ProgressRepository';

export function getNextPage(lastPage: number): number {
	if (lastPage >= 604) {
		return 1;
	}
	return lastPage + 1;
}

export function buildReminderMessage(configuration: Configuration, progress: Progress, notes: Note[], mentionRole: boolean): string {
	let message = '';
	const nextPage = getNextPage(progress.lastPage);
	const nextHadith = progress.lastHadith + 1;

	message += `${mentionRole ? `<@&${configuration.roleId}>` : ''} السلام عليكم ورحمة الله وبركاته\n`;
	message += `وقت المقراة اليومية! 📖\n\n`;
	message += `الصفحة القادمة: [${nextPage}](https://quran.com/${nextPage})\n`;
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
