import assert from 'node:assert/strict';
import test from 'node:test';
import { scheduleStatuses, scheduleTypes } from '../../storage/sqlite/repositories/ScheduleRepository';
import type { Schedule } from '../../storage/sqlite/repositories/ScheduleRepository';
import { buildScheduleFireMessage, formatUserMentions, parsePeopleMentions, serializeMentionUserIds } from './mentions';

test('people mentions accept Discord user mentions and dedupe IDs', () => {
	const parsed = parsePeopleMentions('<@123> <@!456>, <@123>', true);

	assert.equal(parsed.valid, true);
	assert.deepEqual(parsed.userIds, ['123', '456']);
	assert.equal(serializeMentionUserIds(parsed.userIds), '123,456');
	assert.equal(formatUserMentions('123,456'), '<@123> <@456>');
});

test('people mentions reject missing or non-user content when required', () => {
	assert.equal(parsePeopleMentions(null, true).valid, false);
	assert.equal(parsePeopleMentions('', true).valid, false);
	assert.equal(parsePeopleMentions('<@123> asdas', true).valid, false);
	assert.equal(parsePeopleMentions('<@&123>', true).valid, false);
});

test('schedule fire message prepends stored people mentions', () => {
	const schedule = buildSchedule({ mentionUserIds: '123,456', message: 'Team meeting starts soon.' });

	assert.equal(buildScheduleFireMessage(schedule), '<@123> <@456>\nTeam meeting starts soon.');
});

function buildSchedule(schedule: Partial<Schedule>): Schedule {
	return {
		id: 1,
		name: 'Team meeting',
		nameKey: 'team meeting',
		type: scheduleTypes.RECURRING,
		weekdays: '1',
		oneTimeDate: null,
		time: '7:30 PM',
		message: 'Team meeting starts soon.',
		mentionUserIds: '123',
		status: scheduleStatuses.ACTIVE,
		creatorUserId: 'user-1',
		createdAt: '2026-04-15T12:00:00.000Z',
		updatedAt: '2026-04-15T12:00:00.000Z',
		lastRunAt: null,
		...schedule,
	};
}
