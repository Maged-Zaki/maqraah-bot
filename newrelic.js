/**
 * New Relic Agent Configuration for Maqraah Bot
 *
 * This file configures the New Relic agent for monitoring the Discord bot.
 * Environment variables can be used to override these settings.
 */

exports.config = {
	/**
	 * Application name - displayed in New Relic UI
	 * Can be overridden with NEW_RELIC_APP_NAME environment variable
	 */
	app_name: [process.env.NEW_RELIC_APP_NAME || 'maqraah-bot'],

	/**
	 * Your New Relic license key
	 * Required - set via NEW_RELIC_LICENSE_KEY environment variable
	 */
	license_key: process.env.NEW_RELIC_LICENSE_KEY || '',

	/**
	 * Logging configuration
	 */
	logging: {
		/**
		 * Log level: 'trace', 'debug', 'info', 'warn', 'error', 'fatal'
		 * Can be overridden with NEW_RELIC_LOG_LEVEL environment variable
		 */
		level: process.env.NEW_RELIC_LOG_LEVEL || 'info',

		/**
		 * File path for agent logs
		 * Set to 'stdout' to log to console
		 */
		filepath: process.env.NEW_RELIC_LOG_FILEPATH || 'stdout',
	},

	/**
	 * Whether the agent is enabled
	 * Can be disabled with NEW_RELIC_ENABLED=false
	 */
	agent_enabled: process.env.NEW_RELIC_ENABLED !== 'false',

	/**
	 * Whether to capture stack traces for errors
	 */
	capture_params: true,

	/**
	 * Whether to record SQL queries
	 */
	transaction_tracer: {
		record_sql: 'obfuscated',
		explain_threshold: 500,
	},

	/**
	 * Error collector configuration
	 */
	error_collector: {
		/**
		 * Whether to capture errors
		 */
		enabled: true,
		/**
		 * Whether to capture stack traces
		 */
		capture_events: true,
		/**
		 * Maximum number of error events to harvest per cycle
		 */
		max_event_samples_stored: 100,
	},

	/**
	 * Custom events configuration
	 */
	custom_insights_events: {
		/**
		 * Whether to enable custom events
		 */
		enabled: true,
		/**
		 * Maximum number of custom events to harvest per cycle
		 */
		max_samples_stored: 1000,
	},

	/**
	 * Distributed tracing configuration
	 */
	distributed_tracing: {
		enabled: true,
	},

	/**
	 * Infinite tracing configuration (optional)
	 */
	infinite_tracing: {
		trace_observer: {
			host: process.env.NEW_RELIC_TRACE_OBSERVER_HOST || '',
			port: process.env.NEW_RELIC_TRACE_OBSERVER_PORT || 443,
		},
	},

	/**
	 * Application logging configuration
	 * This forwards application logs to New Relic
	 */
	application_logging: {
		enabled: true,
		forwarding: {
			enabled: true,
		},
		metrics: {
			enabled: true,
		},
		local_decorating: {
			enabled: false,
		},
	},

	/**
	 * Browser monitoring (not needed for Discord bot)
	 */
	browser_monitoring: {
		enabled: false,
	},

	/**
	 * Serverless mode (not needed for this bot)
	 */
	serverless_mode: {
		enabled: false,
	},

	/**
	 * High security mode (restricts data collection)
	 */
	high_security: false,

	/**
	 * Security policies
	 */
	security: {
		enabled: false,
	},

	/**
	 * Custom attributes to include in all transactions
	 */
	attributes: {
		/**
		 * Whether to include environment variables
		 */
		include: ['NODE_ENV', 'DISCORD_GUILD_ID'],
		/**
		 * Attributes to exclude
		 */
		exclude: ['DISCORD_TOKEN', 'NEW_RELIC_LICENSE_KEY'],
	},

	/**
	 * Transaction naming rules
	 */
	transaction_name_rules: [
		{
			pattern: '^/commands/(.*)',
			name: 'DiscordCommand/$1',
		},
	],

	/**
	 * Ignore specific URLs or patterns (not applicable for Discord bot)
	 */
	ignore_url_patterns: [],

	/**
	 * Whether to use SSL for New Relic communication
	 */
	ssl: true,

	/**
	 * Proxy configuration (if needed)
	 */
	proxy_host: process.env.NEW_RELIC_PROXY_HOST || '',
	proxy_port: process.env.NEW_RELIC_PROXY_PORT || '',

	/**
	 * API endpoint (usually not needed to change)
	 */
	host: process.env.NEW_RELIC_HOST || 'collector.newrelic.com',
	port: process.env.NEW_RELIC_PORT || 443,

	/**
	 * Whether to send startup events
	 */
	send_startup_events: true,

	/**
	 * Whether to send shutdown events
	 */
	send_shutdown_events: true,

	/**
	 * Labels for grouping applications
	 */
	labels: {
		application: 'discord-bot',
		type: 'maqraah',
	},

	/**
	 * Utilization detection
	 */
	utilization: {
		detect_aws: false,
		detect_pcf: false,
		detect_azure: false,
		detect_gcp: false,
		detect_docker: true,
	},

	/**
	 * Process host display name
	 */
	process_host: {
		display_name: process.env.NEW_RELIC_PROCESS_HOST_DISPLAY_NAME || '',
	},

	/**
	 * Event harvest configuration
	 */
	event_harvest_config: {
		report_period_ms: 60000,
		harvest_limits: {
			analytics_events: 1000,
			custom_events: 1000,
			error_events: 100,
			span_events: 1000,
		},
	},
};
