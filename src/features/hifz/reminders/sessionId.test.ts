import assert from 'node:assert/strict';
import test from 'node:test';
import { getHifzReminderSessionId, getUpcomingHifzSessionId, stripHifzSessionIdPrefix, HIFZ_SESSION_ID_PREFIX } from './sessionId';
import type { Configuration } from '../../../storage/sqlite/repositories/ConfigurationRepository';

test('hifz reminder session id is prefixed with the date', () => {
	const sessionId = getHifzReminderSessionId(new Date('2026-04-15T18:00:00.000Z'), 'UTC');

	assert.equal(sessionId, 'hifz-2026-04-15');
});

test('upcoming hifz session is today before the hifz time', () => {
	const sessionId = getUpcomingHifzSessionId(
		buildConfiguration({ hifzTime: '7:00 PM', timezone: 'UTC' }),
		new Date('2026-04-15T18:59:00.000Z')
	);

	assert.equal(sessionId, 'hifz-2026-04-15');
});

test('upcoming hifz session rolls to the next day once the time passes', () => {
	const sessionId = getUpcomingHifzSessionId(
		buildConfiguration({ hifzTime: '7:00 PM', timezone: 'UTC' }),
		new Date('2026-04-15T19:00:00.000Z')
	);

	assert.equal(sessionId, 'hifz-2026-04-16');
});

test('upcoming hifz session returns null when the time is invalid', () => {
	const sessionId = getUpcomingHifzSessionId(
		buildConfiguration({ hifzTime: 'not-a-time', timezone: 'UTC' }),
		new Date('2026-04-15T19:00:00.000Z')
	);

	assert.equal(sessionId, null);
});

test('upcoming hifz session returns null when the timezone is invalid', () => {
	const sessionId = getUpcomingHifzSessionId(
		buildConfiguration({ hifzTime: '7:00 PM', timezone: 'Not/A/Zone' }),
		new Date('2026-04-15T19:00:00.000Z')
	);

	assert.equal(sessionId, null);
});

test('stripHifzSessionIdPrefix removes the hifz prefix', () => {
	assert.equal(stripHifzSessionIdPrefix(`${HIFZ_SESSION_ID_PREFIX}2026-04-15`), '2026-04-15');
	assert.equal(stripHifzSessionIdPrefix('2026-04-15'), '2026-04-15');
});

function buildConfiguration(configuration: Partial<Configuration>): Pick<Configuration, 'hifzTime' | 'timezone'> {
	return {
		hifzTime: '7:00 PM',
		timezone: 'UTC',
		...configuration,
	} as Pick<Configuration, 'hifzTime' | 'timezone'>;
}
