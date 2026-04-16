import { randomUUID } from 'node:crypto';

export const DESTRUCTIVE_CONFIRMATION_TIMEOUT_MS = 60_000;
export const DESTRUCTIVE_CONFIRMATION_CUSTOM_ID_PREFIX = 'destructive-confirmation';

export const destructiveConfirmationActions = {
	CONFIRM: 'confirm',
	CANCEL: 'cancel',
} as const;

export type DestructiveConfirmationAction = (typeof destructiveConfirmationActions)[keyof typeof destructiveConfirmationActions];

export interface DestructiveConfirmationCustomId {
	action: DestructiveConfirmationAction;
	confirmationId: string;
}

export interface DestructiveConfirmationResponse {
	content: string;
}

export interface CreateDestructiveConfirmationOptions {
	userId: string;
	onConfirm: () => Promise<DestructiveConfirmationResponse | string | void>;
	onCancel?: () => Promise<DestructiveConfirmationResponse | string | void>;
	timeoutMs?: number;
	expiredContent?: string;
	cancelledContent?: string;
}

export type DestructiveConfirmationResult =
	| { status: 'confirmed'; content: string }
	| { status: 'cancelled'; content: string }
	| { status: 'expired'; content: string }
	| { status: 'not_found'; content: string }
	| { status: 'unauthorized'; ownerUserId: string };

export interface PendingDestructiveConfirmation {
	id: string;
	userId: string;
	expiresAt: number;
	onConfirm: () => Promise<DestructiveConfirmationResponse | string | void>;
	onCancel?: () => Promise<DestructiveConfirmationResponse | string | void>;
	timeout?: NodeJS.Timeout;
	expiredContent: string;
	cancelledContent: string;
}

export class InMemoryDestructiveConfirmationStore {
	private pendingConfirmations = new Map<string, PendingDestructiveConfirmation>();

	constructor(
		private readonly now: () => number = () => Date.now(),
		private readonly idGenerator: () => string = () => randomUUID()
	) {}

	create(options: CreateDestructiveConfirmationOptions): PendingDestructiveConfirmation {
		const timeoutMs = options.timeoutMs ?? DESTRUCTIVE_CONFIRMATION_TIMEOUT_MS;
		const id = this.idGenerator();
		const confirmation: PendingDestructiveConfirmation = {
			id,
			userId: options.userId,
			expiresAt: this.now() + timeoutMs,
			onConfirm: options.onConfirm,
			onCancel: options.onCancel,
			expiredContent: options.expiredContent ?? 'This confirmation expired. No changes were made.',
			cancelledContent: options.cancelledContent ?? 'Cancelled. No changes were made.',
		};

		if (timeoutMs > 0) {
			confirmation.timeout = setTimeout(() => {
				this.pendingConfirmations.delete(id);
			}, timeoutMs);
			confirmation.timeout.unref?.();
		}

		this.pendingConfirmations.set(id, confirmation);
		return confirmation;
	}

	async confirm(id: string, userId: string): Promise<DestructiveConfirmationResult> {
		const confirmation = this.pendingConfirmations.get(id);
		const unavailable = this.validateAvailableConfirmation(confirmation, userId);
		if (unavailable) {
			return unavailable;
		}

		if (!confirmation) {
			return { status: 'not_found', content: 'This confirmation expired or is no longer available. No changes were made.' };
		}

		this.delete(id);
		const response = await confirmation.onConfirm();
		return { status: 'confirmed', content: normalizeResponse(response, 'Confirmed.') };
	}

	async cancel(id: string, userId: string): Promise<DestructiveConfirmationResult> {
		const confirmation = this.pendingConfirmations.get(id);
		const unavailable = this.validateAvailableConfirmation(confirmation, userId);
		if (unavailable) {
			return unavailable;
		}

		if (!confirmation) {
			return { status: 'not_found', content: 'This confirmation expired or is no longer available. No changes were made.' };
		}

		this.delete(id);
		const response = await confirmation.onCancel?.();
		return { status: 'cancelled', content: normalizeResponse(response, confirmation.cancelledContent) };
	}

	get(id: string): PendingDestructiveConfirmation | undefined {
		return this.pendingConfirmations.get(id);
	}

	clear(): void {
		for (const confirmation of this.pendingConfirmations.values()) {
			if (confirmation.timeout) {
				clearTimeout(confirmation.timeout);
			}
		}
		this.pendingConfirmations.clear();
	}

	private validateAvailableConfirmation(
		confirmation: PendingDestructiveConfirmation | undefined,
		userId: string
	): DestructiveConfirmationResult | null {
		if (!confirmation) {
			return { status: 'not_found', content: 'This confirmation expired or is no longer available. No changes were made.' };
		}

		if (confirmation.userId !== userId) {
			return { status: 'unauthorized', ownerUserId: confirmation.userId };
		}

		if (this.now() >= confirmation.expiresAt) {
			this.delete(confirmation.id);
			return { status: 'expired', content: confirmation.expiredContent };
		}

		return null;
	}

	private delete(id: string): void {
		const confirmation = this.pendingConfirmations.get(id);
		if (confirmation?.timeout) {
			clearTimeout(confirmation.timeout);
		}
		this.pendingConfirmations.delete(id);
	}
}

export const destructiveConfirmationStore = new InMemoryDestructiveConfirmationStore();

export function buildDestructiveConfirmationCustomId(action: DestructiveConfirmationAction, confirmationId: string): string {
	return `${DESTRUCTIVE_CONFIRMATION_CUSTOM_ID_PREFIX}:${action}:${confirmationId}`;
}

export function parseDestructiveConfirmationCustomId(customId: string): DestructiveConfirmationCustomId | null {
	const [prefix, action, confirmationId] = customId.split(':');

	if (prefix !== DESTRUCTIVE_CONFIRMATION_CUSTOM_ID_PREFIX || !confirmationId || !isDestructiveConfirmationAction(action)) {
		return null;
	}

	return { action, confirmationId };
}

function isDestructiveConfirmationAction(action: string | undefined): action is DestructiveConfirmationAction {
	return Object.values(destructiveConfirmationActions).includes(action as DestructiveConfirmationAction);
}

function normalizeResponse(response: DestructiveConfirmationResponse | string | void, fallback: string): string {
	if (!response) {
		return fallback;
	}

	return typeof response === 'string' ? response : response.content;
}
