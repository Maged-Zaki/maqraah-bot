import assert from 'node:assert/strict';
import test from 'node:test';
import { scheduleStatuses, scheduleTypes } from '../../storage/sqlite/repositories/ScheduleRepository';
import type { Schedule } from '../../storage/sqlite/repositories/ScheduleRepository';
import { buildScheduleFireMessage, formatMentionTargets, parsePeopleMentions, parseStoredMentionTargets, serializeMentionTargets } from './mentions';

test('people mentions accept Discord user and role mentions and dedupe targets', () => {
	const parsed = parsePeopleMentions('<@123> <@!456>, <@&789> <@&789> <@123>', true);

	assert.equal(parsed.valid, true);
	assert.deepEqual(parsed.targets, [
		{ type: 'user', id: '123' },
		{ type: 'user', id: '456' },
		{ type: 'role', id: '789' },
	]);
	assert.equal(serializeMentionTargets(parsed.targets), 'user:123,user:456,role:789');
	assert.equal(formatMentionTargets('user:123,user:456,role:789'), '<@123> <@456> <@&789>');
});

test('stored mention targets preserve same ID across user and role types', () => {
	const parsed = parsePeopleMentions('<@123> <@&123>', true);

	assert.equal(parsed.valid, true);
	assert.deepEqual(parsed.targets, [
		{ type: 'user', id: '123' },
		{ type: 'role', id: '123' },
	]);
	assert.equal(serializeMentionTargets(parsed.targets), 'user:123,role:123');
});

test('stored mention targets read legacy bare user IDs', () => {
	assert.deepEqual(parseStoredMentionTargets('123,456'), [
		{ type: 'user', id: '123' },
		{ type: 'user', id: '456' },
	]);
	assert.equal(formatMentionTargets('123,role:456,user:789,bad'), '<@123> <@&456> <@789>');
});

test('people mentions reject missing or non-mentionable content when required', () => {
	assert.equal(parsePeopleMentions(null, true).valid, false);
	assert.equal(parsePeopleMentions('', true).valid, false);
	assert.equal(parsePeopleMentions('<@123> asdas', true).valid, false);
	assert.equal(parsePeopleMentions('<#123>', true).valid, false);
	assert.equal(parsePeopleMentions('@everyone', true).valid, false);
});

test('schedule fire message prepends stored people mentions', () => {
	const schedule = buildSchedule({ mentionUserIds: 'user:123,role:456', message: 'Team meeting starts soon.' });

	assert.equal(buildScheduleFireMessage(schedule), '<@123> <@&456>\nTeam meeting starts soon.');
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
