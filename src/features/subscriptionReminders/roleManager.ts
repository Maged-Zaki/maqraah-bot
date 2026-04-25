import { PermissionsBitField } from 'discord.js';
import { reminderCategoryRoleRepository } from '../../storage/sqlite';
import { getSubscriptionReminderCategory, type SubscriptionReminderCategoryKey } from './catalog';

export async function ensureCategoryRole(guild: any, categoryKey: SubscriptionReminderCategoryKey, createIfMissing = true): Promise<any | null> {
	const category = getSubscriptionReminderCategory(categoryKey);
	if (!category || !guild) {
		return null;
	}

	const storedRole = await reminderCategoryRoleRepository.getByCategoryKey(category.key);
	const cachedById = storedRole ? getRoleById(guild, storedRole.roleId) : null;
	if (cachedById) {
		if (storedRole?.roleName !== category.roleName) {
			await reminderCategoryRoleRepository.upsert({ categoryKey: category.key, roleId: cachedById.id, roleName: category.roleName });
		}
		return cachedById;
	}

	const cachedByName = findRoleByName(guild, category.roleName);
	if (cachedByName) {
		await reminderCategoryRoleRepository.upsert({ categoryKey: category.key, roleId: cachedByName.id, roleName: category.roleName });
		return cachedByName;
	}

	if (!createIfMissing) {
		return null;
	}

	assertCanManageRoles(guild);
	const createdRole = await guild.roles.create({
		name: category.roleName,
		mentionable: true,
		reason: `Create ${category.roleName} subscription reminder role`,
	});

	await reminderCategoryRoleRepository.upsert({ categoryKey: category.key, roleId: createdRole.id, roleName: category.roleName });
	return createdRole;
}

export async function subscribeMemberToCategory(guild: any, member: any, categoryKey: SubscriptionReminderCategoryKey): Promise<any> {
	assertCanManageRoles(guild);
	const role = await ensureCategoryRole(guild, categoryKey, true);
	if (!role) {
		throw new Error('Reminder category role could not be resolved.');
	}

	assertCanManageRole(guild, role);

	if (memberHasRole(member, role.id)) {
		return { role, changed: false };
	}

	await member.roles.add(role.id);
	return { role, changed: true };
}

export async function unsubscribeMemberFromCategory(guild: any, member: any, categoryKey: SubscriptionReminderCategoryKey): Promise<any> {
	const role = await ensureCategoryRole(guild, categoryKey, false);
	if (!role || !memberHasRole(member, role.id)) {
		return { role, changed: false };
	}

	assertCanManageRoles(guild);
	assertCanManageRole(guild, role);
	await member.roles.remove(role.id);
	return { role, changed: true };
}

export function memberHasRole(member: any, roleId: string): boolean {
	const roles = member?.roles;
	if (!roles) {
		return false;
	}

	if (roles.cache?.has(roleId)) {
		return true;
	}

	return typeof roles.has === 'function' ? roles.has(roleId) : false;
}

export function assertCanManageRoles(guild: any): void {
	const botMember = guild?.members?.me;
	const permissions = botMember?.permissions;
	if (!permissions || typeof permissions.has !== 'function' || !permissions.has(PermissionsBitField.Flags.ManageRoles)) {
		throw new Error('I need the Manage Roles permission before I can manage reminder subscriptions.');
	}
}

function assertCanManageRole(guild: any, role: any): void {
	const highestRole = guild?.members?.me?.roles?.highest;
	if (highestRole && typeof highestRole.comparePositionTo === 'function' && highestRole.comparePositionTo(role) <= 0) {
		throw new Error('My highest role must be above the reminder role before I can manage it.');
	}
}

function getRoleById(guild: any, roleId: string): any | null {
	return guild?.roles?.cache?.get(roleId) ?? null;
}

function findRoleByName(guild: any, roleName: string): any | null {
	const rolesCache = guild?.roles?.cache;
	if (!rolesCache) {
		return null;
	}

	if (typeof rolesCache.find === 'function') {
		return rolesCache.find((role: any) => role.name === roleName) ?? null;
	}

	if (typeof rolesCache.values === 'function') {
		for (const role of rolesCache.values()) {
			if (role.name === roleName) {
				return role;
			}
		}
	}

	return null;
}
