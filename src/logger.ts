/**
 * Centralized Logger Module
 *
 * This module provides structured logging for the Maqraah bot.
 * It includes Discord-specific context attributes.
 * Console logs are automatically collected by New Relic agent.
 */

/**
 * Log levels
 */
export enum LogLevel {
	TRACE = 'trace',
	DEBUG = 'debug',
	INFO = 'info',
	WARN = 'warn',
	ERROR = 'error',
	FATAL = 'fatal',
}

/**
 * Discord context interface
 */
export interface DiscordContext {
	userId?: string;
	guildId?: string;
	channelId?: string;
	commandName?: string;
	subcommand?: string;
	username?: string;
}

/**
 * Operation context interface
 */
export interface OperationContext {
	operationType?: string;
	operationStatus?: 'success' | 'failure' | 'partial';
	duration?: number;
	error?: Error;
	additionalData?: Record<string, any>;
}

/**
 * Note event data interface
 */
export interface NoteEventData {
	userId: string;
	username?: string;
	guildId?: string;
	channelId?: string;
	noteCount?: number;
	noteContent?: string;
	noteIds?: number[];
	operation: 'created' | 'viewed' | 'deleted' | 'included_in_reminder';
}

/**
 * Logger class
 */
class Logger {
	/**
	 * Log a message with context
	 */
	private log(level: LogLevel, message: string, discordContext?: DiscordContext, operationContext?: OperationContext) {
		const timestamp = new Date().toISOString();
		const logEntry = {
			timestamp,
			level,
			message,
			...this.buildAttributes(discordContext, operationContext),
		};

		// Log to console (New Relic agent will automatically collect these)
		switch (level) {
			case LogLevel.TRACE:
			case LogLevel.DEBUG:
				console.debug(JSON.stringify(logEntry));
				break;
			case LogLevel.INFO:
				console.info(JSON.stringify(logEntry));
				break;
			case LogLevel.WARN:
				console.warn(JSON.stringify(logEntry));
				break;
			case LogLevel.ERROR:
			case LogLevel.FATAL:
				console.error(JSON.stringify(logEntry));
				break;
		}
	}

	/**
	 * Build attributes for logging
	 */
	private buildAttributes(discordContext?: DiscordContext, operationContext?: OperationContext): Record<string, any> {
		const attributes: Record<string, any> = {};

		if (discordContext) {
			if (discordContext.userId) attributes['discord.userId'] = discordContext.userId;
			if (discordContext.guildId) attributes['discord.guildId'] = discordContext.guildId;
			if (discordContext.channelId) attributes['discord.channelId'] = discordContext.channelId;
			if (discordContext.commandName) attributes['discord.commandName'] = discordContext.commandName;
			if (discordContext.subcommand) attributes['discord.subcommand'] = discordContext.subcommand;
			if (discordContext.username) attributes['discord.username'] = discordContext.username;
		}

		if (operationContext) {
			if (operationContext.operationType) attributes['operation.type'] = operationContext.operationType;
			if (operationContext.operationStatus) attributes['operation.status'] = operationContext.operationStatus;
			if (operationContext.duration) attributes['operation.duration'] = operationContext.duration;
			if (operationContext.additionalData) {
				Object.entries(operationContext.additionalData).forEach(([key, value]) => {
					attributes[`custom.${key}`] = value;
				});
			}
		}

		return attributes;
	}

	/**
	 * Log a trace message
	 */
	trace(message: string, discordContext?: DiscordContext, operationContext?: OperationContext) {
		this.log(LogLevel.TRACE, message, discordContext, operationContext);
	}

	/**
	 * Log a debug message
	 */
	debug(message: string, discordContext?: DiscordContext, operationContext?: OperationContext) {
		this.log(LogLevel.DEBUG, message, discordContext, operationContext);
	}

	/**
	 * Log an info message
	 */
	info(message: string, discordContext?: DiscordContext, operationContext?: OperationContext) {
		this.log(LogLevel.INFO, message, discordContext, operationContext);
	}

	/**
	 * Log a warning message
	 */
	warn(message: string, discordContext?: DiscordContext, operationContext?: OperationContext) {
		this.log(LogLevel.WARN, message, discordContext, operationContext);
	}

	/**
	 * Log an error message
	 */
	error(message: string, error?: Error, discordContext?: DiscordContext, operationContext?: OperationContext) {
		const opContext = { ...operationContext, error };
		this.log(LogLevel.ERROR, message, discordContext, opContext);
	}

	/**
	 * Log a fatal error message
	 */
	fatal(message: string, error?: Error, discordContext?: DiscordContext, operationContext?: OperationContext) {
		const opContext = { ...operationContext, error };
		this.log(LogLevel.FATAL, message, discordContext, opContext);
	}

	/**
	 * Record a note-related event (logs to console)
	 */
	recordNoteEvent(data: NoteEventData) {
		const eventType = `Note${data.operation.charAt(0).toUpperCase() + data.operation.slice(1)}`;
		const attributes: Record<string, any> = {
			eventType,
			userId: data.userId,
			operation: data.operation,
			timestamp: Date.now(),
		};

		if (data.username) attributes.username = data.username;
		if (data.guildId) attributes.guildId = data.guildId;
		if (data.channelId) attributes.channelId = data.channelId;
		if (data.noteCount !== undefined) attributes.noteCount = data.noteCount;
		if (data.noteContent) attributes.noteContent = data.noteContent.substring(0, 200); // Truncate long notes
		if (data.noteIds) attributes.noteIds = data.noteIds.join(',');

		this.info(`Note event: ${eventType}`, { userId: data.userId, guildId: data.guildId }, { additionalData: attributes });
	}

	/**
	 * Record a command execution event (logs to console)
	 */
	recordCommandEvent(commandName: string, subcommand?: string, discordContext?: DiscordContext, duration?: number, success: boolean = true) {
		this.info(`Command executed: ${commandName}`, discordContext, {
			operationType: 'command_execution',
			operationStatus: success ? 'success' : 'failure',
			duration,
			additionalData: { subcommand, success },
		});
	}

	/**
	 * Record a database operation event (logs to console)
	 */
	recordDatabaseEvent(operation: string, table: string, duration?: number, success: boolean = true, error?: string) {
		this.info(`Database operation: ${operation} on ${table}`, undefined, {
			operationType: 'database_operation',
			operationStatus: success ? 'success' : 'failure',
			duration,
			additionalData: { table, error },
		});
	}

	/**
	 * Record a scheduler event (logs to console)
	 */
	recordSchedulerEvent(eventType: 'scheduled' | 'executed' | 'failed' | 'stopped', details?: Record<string, any>) {
		this.info(`Scheduler event: ${eventType}`, undefined, {
			operationType: 'scheduler_event',
			additionalData: details,
		});
	}

	/**
	 * Record a reminder sent event (logs to console)
	 */
	recordReminderSentEvent(guildId: string, channelId: string, noteCount: number, success: boolean = true) {
		this.info(`Reminder sent to guild ${guildId}`, undefined, {
			operationType: 'reminder_sent',
			operationStatus: success ? 'success' : 'failure',
			additionalData: { guildId, channelId, noteCount },
		});
	}
}

// Export singleton instance
export const logger = new Logger();

// Export convenience functions
export const logTrace = (message: string, discordContext?: DiscordContext, operationContext?: OperationContext) =>
	logger.trace(message, discordContext, operationContext);

export const logDebug = (message: string, discordContext?: DiscordContext, operationContext?: OperationContext) =>
	logger.debug(message, discordContext, operationContext);

export const logInfo = (message: string, discordContext?: DiscordContext, operationContext?: OperationContext) =>
	logger.info(message, discordContext, operationContext);

export const logWarn = (message: string, discordContext?: DiscordContext, operationContext?: OperationContext) =>
	logger.warn(message, discordContext, operationContext);

export const logError = (message: string, error?: Error, discordContext?: DiscordContext, operationContext?: OperationContext) =>
	logger.error(message, error, discordContext, operationContext);

export const logFatal = (message: string, error?: Error, discordContext?: DiscordContext, operationContext?: OperationContext) =>
	logger.fatal(message, error, discordContext, operationContext);
