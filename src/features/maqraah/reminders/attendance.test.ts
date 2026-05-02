import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_PATH ??= ':memory:';

const { attendanceStatuses, buildAttendanceAnnouncementMessage } = require('./attendance') as typeof import('./attendance');

test('attendance announcement message frames all attendance lines', () => {
	const message = buildAttendanceAnnouncementMessage([
		{ userId: 'user-1', status: attendanceStatuses.LATE },
		{ userId: 'user-2', status: attendanceStatuses.CANNOT_MAKE_IT },
	]);

	assert.equal(
		message,
		'**تحديثات الحضور**\n> <@user-1> هيتأخر شوية عن المقراة.\n> <@user-2> مش هيقدر يحضر المقراة النهارده.'
	);
});

test('attendance announcement message is omitted when there are no attendance lines', () => {
	assert.equal(buildAttendanceAnnouncementMessage([]), null);
});
