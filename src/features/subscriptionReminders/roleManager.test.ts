import assert from 'node:assert/strict';
import test from 'node:test';
import { PermissionsBitField } from 'discord.js';
import type { ReminderCategoryRole } from '../../storage/sqlite/repositories/ReminderCategoryRoleRepository';

process.env.DATABASE_PATH ??= ':memory:';

const { reminderCategoryRoleRepository } = require('../../storage/sqlite') as typeof import('../../storage/sqlite');
const { ensureCategoryRole, subscribeMemberToCategory, unsubscribeMemberFromCategory } = require('./roleManager') as typeof import('./roleManager');

test('subscribing creates the category role and assigns it to the member', { concurrency: false }, async () => {
	const guild = createGuild();
	const member = createMember();
	const storedRoles = new Map<string, ReminderCategoryRole>();

	await withRoleRepositoryStore(storedRoles, async () => {
		const result = await subscribeMemberToCategory(guild, member, 'muhammed-way');

		assert.equal(result.changed, true);
		assert.equal(result.role.name, 'تذكيرات صيام المحمد');
		assert.equal(member.roles.cache.has(result.role.id), true);
		assert.equal(storedRoles.get('muhammed-way')?.roleId, result.role.id);
	});
});

test('subscribing reuses an existing category role by name', { concurrency: false }, async () => {
	const existingRole = { id: 'existing-role', name: 'تذكيرات صيام المحمد' };
	const guild = createGuild({ roles: [existingRole] });
	const member = createMember();
	const storedRoles = new Map<string, ReminderCategoryRole>();

	await withRoleRepositoryStore(storedRoles, async () => {
		const result = await subscribeMemberToCategory(guild, member, 'muhammed-way');

		assert.equal(result.role.id, existingRole.id);
		assert.equal(guild.createdRoles.length, 0);
		assert.equal(member.roles.cache.has(existingRole.id), true);
	});
});

test('unsubscribing removes the category role from the member', { concurrency: false }, async () => {
	const existingRole = { id: 'existing-role', name: 'تذكيرات صيام المحمد' };
	const guild = createGuild({ roles: [existingRole] });
	const member = createMember([existingRole.id]);
	const storedRoles = new Map<string, ReminderCategoryRole>([['muhammed-way', buildStoredRole('muhammed-way', existingRole.id, existingRole.name)]]);

	await withRoleRepositoryStore(storedRoles, async () => {
		const result = await unsubscribeMemberFromCategory(guild, member, 'muhammed-way');

		assert.equal(result.changed, true);
		assert.equal(member.roles.cache.has(existingRole.id), false);
	});
});

test('missing stored roles are recreated when reminders need a category role', { concurrency: false }, async () => {
	const guild = createGuild();
	const storedRoles = new Map<string, ReminderCategoryRole>([['muhammed-way', buildStoredRole('muhammed-way', 'deleted-role', 'تذكيرات صيام المحمد')]]);

	await withRoleRepositoryStore(storedRoles, async () => {
		const role = await ensureCategoryRole(guild, 'muhammed-way', true);

		assert.equal(role?.name, 'تذكيرات صيام المحمد');
		assert.notEqual(role?.id, 'deleted-role');
		assert.equal(storedRoles.get('muhammed-way')?.roleId, role?.id);
	});
});

test('permission failures return a clear Manage Roles error', { concurrency: false }, async () => {
	const guild = createGuild({ canManageRoles: false });
	const member = createMember();
	const storedRoles = new Map<string, ReminderCategoryRole>();

	await withRoleRepositoryStore(storedRoles, async () => {
		await assert.rejects(() => subscribeMemberToCategory(guild, member, 'muhammed-way'), /Manage Roles/);
	});
});

async function withRoleRepositoryStore(store: Map<string, ReminderCategoryRole>, callback: () => Promise<void>): Promise<void> {
	const originalGetByCategoryKey = reminderCategoryRoleRepository.getByCategoryKey;
	const originalUpsert = reminderCategoryRoleRepository.upsert;

	reminderCategoryRoleRepository.getByCategoryKey = async (categoryKey: string) => store.get(categoryKey) ?? null;
	reminderCategoryRoleRepository.upsert = async (input: any) => {
		const now = new Date().toISOString();
		const current = store.get(input.categoryKey);
		const role = {
			categoryKey: input.categoryKey,
			roleId: input.roleId,
			roleName: input.roleName,
			createdAt: current?.createdAt ?? now,
			updatedAt: now,
		};
		store.set(input.categoryKey, role);
		return role;
	};

	try {
		await callback();
	} finally {
		reminderCategoryRoleRepository.getByCategoryKey = originalGetByCategoryKey;
		reminderCategoryRoleRepository.upsert = originalUpsert;
	}
}

function createGuild(input: { canManageRoles?: boolean; roles?: any[] } = {}) {
	const rolesCache = new Map<string, any>();
	for (const role of input.roles ?? []) {
		rolesCache.set(role.id, role);
	}

	const createdRoles: any[] = [];
	return {
		createdRoles,
		roles: {
			cache: rolesCache,
			create: async (roleInput: any) => {
				const role = { id: `created-role-${createdRoles.length + 1}`, name: roleInput.name };
				createdRoles.push(role);
				rolesCache.set(role.id, role);
				return role;
			},
		},
		members: {
			me: {
				permissions: {
					has: (permission: bigint) => (input.canManageRoles ?? true) && permission === PermissionsBitField.Flags.ManageRoles,
				},
				roles: {
					highest: {
						comparePositionTo: () => 1,
					},
				},
			},
		},
	};
}

function createMember(roleIds: string[] = []) {
	const roleCache = new Map<string, boolean>(roleIds.map((roleId) => [roleId, true]));
	return {
		roles: {
			cache: roleCache,
			add: async (roleId: string) => {
				roleCache.set(roleId, true);
			},
			remove: async (roleId: string) => {
				roleCache.delete(roleId);
			},
		},
	};
}

function buildStoredRole(categoryKey: string, roleId: string, roleName: string): ReminderCategoryRole {
	return {
		categoryKey,
		roleId,
		roleName,
		createdAt: '2026-04-20T12:00:00.000Z',
		updatedAt: '2026-04-20T12:00:00.000Z',
	};
}
