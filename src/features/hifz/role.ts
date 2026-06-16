import type { Configuration } from '../../storage/sqlite/repositories/ConfigurationRepository';

export function resolveHifzRoleId(configuration: Pick<Configuration, 'hifzRoleId' | 'roleId'>): string {
	const hifzRoleId = configuration.hifzRoleId;
	if (typeof hifzRoleId === 'string' && hifzRoleId.trim().length > 0 && hifzRoleId.toLowerCase() !== 'not set') {
		return hifzRoleId;
	}

	return configuration.roleId;
}
