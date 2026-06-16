import assert from 'node:assert/strict';
import test from 'node:test';
import type { Configuration } from '../../storage/sqlite/repositories/ConfigurationRepository';
import { resolveHifzRoleId } from './role';

test('hifz role resolver prefers a configured hifzRoleId', () => {
	assert.equal(resolveHifzRoleId(buildConfig({ hifzRoleId: 'hifz-role', roleId: 'maqraah-role' })), 'hifz-role');
});

test('hifz role resolver falls back to the maqraah roleId when hifzRoleId is unset', () => {
	assert.equal(resolveHifzRoleId(buildConfig({ hifzRoleId: undefined, roleId: 'maqraah-role' })), 'maqraah-role');
});

test('hifz role resolver falls back when hifzRoleId is "Not set"', () => {
	assert.equal(resolveHifzRoleId(buildConfig({ hifzRoleId: 'Not set', roleId: 'maqraah-role' })), 'maqraah-role');
});

test('hifz role resolver falls back when hifzRoleId is empty', () => {
	assert.equal(resolveHifzRoleId(buildConfig({ hifzRoleId: '   ', roleId: 'maqraah-role' })), 'maqraah-role');
});

function buildConfig(config: Partial<Pick<Configuration, 'hifzRoleId' | 'roleId'>>): Pick<Configuration, 'hifzRoleId' | 'roleId'> {
	return { roleId: 'default-role', ...config };
}
