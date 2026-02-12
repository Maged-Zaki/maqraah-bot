/**
 * Centralized Logger Module
 *
 * This module provides structured logging for the Maqraah bot.
 * It uses Winston as the underlying logger with New Relic integration.
 * New Relic automatically adds context to Winston logs.
 */

import winston from 'winston';
// New Relic agent automatically instruments Winston when application_logging is enabled

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

// Create Winston logger with New Relic format enrichment
const winstonLogger = winston.createLogger({
	level: 'debug',
	levels: {
		fatal: 0,
		error: 1,
		warn: 2,
		info: 3,
		debug: 4,
		trace: 5,
	},
	format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
	transports: [
		// Console transport for local development
		new winston.transports.Console({
			format: winston.format.combine(
				winston.format.colorize(),
				winston.format.printf(({ level, message, timestamp, ...metadata }) => {
					let msg = `${timestamp} [${level}]: ${message}`;
					if (Object.keys(metadata).length > 0) {
						msg += ` ${JSON.stringify(metadata)}`;
					}
					return msg;
				})
			),
		}),
	],
});

/**
 * Logger class - wraps Winston while maintaining the existing interface
 */
class Logger {
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
			if (operationContext.error) {
				attributes['error.message'] = operationContext.error.message;
				attributes['error.stack'] = operationContext.error.stack;
			}
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
		const attributes = this.buildAttributes(discordContext, operationContext);
		winstonLogger.log('trace', message, attributes);
	}

	/**
	 * Log a debug message
	 */
	debug(message: string, discordContext?: DiscordContext, operationContext?: OperationContext) {
		const attributes = this.buildAttributes(discordContext, operationContext);
		winstonLogger.debug(message, attributes);
	}

	/**
	 * Log an info message
	 */
	info(message: string, discordContext?: DiscordContext, operationContext?: OperationContext) {
		const attributes = this.buildAttributes(discordContext, operationContext);
		winstonLogger.info(message, attributes);
	}

	/**
	 * Log a warning message
	 */
	warn(message: string, discordContext?: DiscordContext, operationContext?: OperationContext) {
		const attributes = this.buildAttributes(discordContext, operationContext);
		winstonLogger.warn(message, attributes);
	}

	/**
	 * Log an error message
	 */
	error(message: string, error?: Error, discordContext?: DiscordContext, operationContext?: OperationContext) {
		const opContext = { ...operationContext, error };
		const attributes = this.buildAttributes(discordContext, opContext);
		winstonLogger.error(message, attributes);
	}

	/**
	 * Log a fatal error message
	 */
	fatal(message: string, error?: Error, discordContext?: DiscordContext, operationContext?: OperationContext) {
		const opContext = { ...operationContext, error };
		const attributes = this.buildAttributes(discordContext, opContext);
		winstonLogger.log('fatal', message, attributes);
	}

	/**
	 * Record a note-related event
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
	 * Record a command execution event
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
	 * Record a database operation event
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
	 * Record a scheduler event
	 */
	recordSchedulerEvent(eventType: 'scheduled' | 'executed' | 'failed' | 'stopped', details?: Record<string, any>) {
		this.info(`Scheduler event: ${eventType}`, undefined, {
			operationType: 'scheduler_event',
			additionalData: details,
		});
	}

	/**
	 * Record a reminder sent event
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
