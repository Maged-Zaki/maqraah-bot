export function getReminderChannel(client: any, channelId: string): any | null {
	return client?.channels?.cache?.get(channelId) ?? null;
}

export function isSendableTextChannel(channel: any): boolean {
	if (!channel) {
		return false;
	}

	if (typeof channel.isTextBased === 'function' && !channel.isTextBased()) {
		return false;
	}

	return typeof channel.send === 'function';
}
