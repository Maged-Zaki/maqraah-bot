import { randomBytes } from 'crypto';

export const scheduleSetupActions = {
	CREATE_RECURRING: 'create_recurring',
	CREATE_ONE_TIME: 'create_one_time',
	UPDATE_RECURRING: 'update_recurring',
	UPDATE_ONE_TIME: 'update_one_time',
} as const;

export type ScheduleSetupAction = (typeof scheduleSetupActions)[keyof typeof scheduleSetupActions];

export interface PendingScheduleSetup {
	action: ScheduleSetupAction;
	userId: string;
	expiresAt: number;
	scheduleId?: number;
	weekdays?: number[];
}

const pendingSetups = new Map<string, PendingScheduleSetup>();
const setupTtlMs = 10 * 60 * 1000;

export function createPendingScheduleSetup(input: Omit<PendingScheduleSetup, 'expiresAt'>): string {
	cleanupExpiredPendingSetups();
	const token = randomBytes(8).toString('hex');
	pendingSetups.set(token, {
		...input,
		expiresAt: Date.now() + setupTtlMs,
	});
	return token;
}

export function getPendingScheduleSetup(token: string, userId: string): PendingScheduleSetup | null {
	cleanupExpiredPendingSetups();
	const setup = pendingSetups.get(token);
	if (!setup || setup.userId !== userId) {
		return null;
	}

	return setup;
}

export function updatePendingScheduleSetup(token: string, update: Partial<PendingScheduleSetup>): PendingScheduleSetup | null {
	const setup = pendingSetups.get(token);
	if (!setup) {
		return null;
	}

	const nextSetup = { ...setup, ...update, expiresAt: Date.now() + setupTtlMs };
	pendingSetups.set(token, nextSetup);
	return nextSetup;
}

export function consumePendingScheduleSetup(token: string, userId: string): PendingScheduleSetup | null {
	const setup = getPendingScheduleSetup(token, userId);
	if (!setup) {
		return null;
	}

	pendingSetups.delete(token);
	return setup;
}

export function clearPendingScheduleSetups(): void {
	pendingSetups.clear();
}

function cleanupExpiredPendingSetups(): void {
	const now = Date.now();
	for (const [token, setup] of pendingSetups.entries()) {
		if (setup.expiresAt <= now) {
			pendingSetups.delete(token);
		}
	}
}
