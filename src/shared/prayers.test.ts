import assert from 'node:assert/strict';
import test from 'node:test';
import { formatPrayerName, normalizePrayerName, prayerNames } from './prayers';

test('normalizePrayerName recognizes all six prayer names', () => {
	assert.equal(normalizePrayerName('fajr'), 'fajr');
	assert.equal(normalizePrayerName('sunrise'), 'sunrise');
	assert.equal(normalizePrayerName('dhuhr'), 'dhuhr');
	assert.equal(normalizePrayerName('asr'), 'asr');
	assert.equal(normalizePrayerName('maghrib'), 'maghrib');
	assert.equal(normalizePrayerName('isha'), 'isha');
});

test('normalizePrayerName is case insensitive', () => {
	assert.equal(normalizePrayerName('Fajr'), 'fajr');
	assert.equal(normalizePrayerName('MAGHRIB'), 'maghrib');
	assert.equal(normalizePrayerName('AsR'), 'asr');
});

test('normalizePrayerName trims whitespace', () => {
	assert.equal(normalizePrayerName('  fajr  '), 'fajr');
	assert.equal(normalizePrayerName('\tisha\t'), 'isha');
});

test('normalizePrayerName returns null for invalid input', () => {
	assert.equal(normalizePrayerName('invalid'), null);
	assert.equal(normalizePrayerName(''), null);
	assert.equal(normalizePrayerName('fajr asr'), null);
});

test('normalizePrayerName returns null for null and undefined', () => {
	assert.equal(normalizePrayerName(null), null);
	assert.equal(normalizePrayerName(undefined), null);
});

test('formatPrayerName returns display names for all prayers', () => {
	assert.equal(formatPrayerName('fajr'), 'Fajr');
	assert.equal(formatPrayerName('sunrise'), 'Sunrise');
	assert.equal(formatPrayerName('dhuhr'), 'Dhuhr');
	assert.equal(formatPrayerName('asr'), 'Asr');
	assert.equal(formatPrayerName('maghrib'), 'Maghrib');
	assert.equal(formatPrayerName('isha'), 'Isha');
});

test('prayerNames exports all six prayer names', () => {
	assert.equal(prayerNames.length, 6);
	assert.ok(prayerNames.includes('fajr'));
	assert.ok(prayerNames.includes('maghrib'));
});
