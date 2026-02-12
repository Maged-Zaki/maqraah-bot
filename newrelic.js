/* eslint-disable */
'use strict';

require('dotenv').config();

exports.config = {
	app_name: 'maqraah-bot',
	license_key: process.env.NEW_RELIC_LICENSE_KEY,
	distributed_tracing: {
		enabled: true,
	},
	application_logging: {
		enabled: 'true',
		forwarding: {
			enabled: true,
		},
		metrics: {
			enabled: true,
		},
		local_decorating: {
			enabled: true,
		},
	},
	logging: {
		enabled: true,
		level: 'info'
	},
	error_collector: {
		enabled: true,
		capture_events: true,
	},
	transaction_tracer: {
		enabled: true,
	},
	cross_application_tracer: {
		enabled: true,
	},
	allow_all_headers: true,

	security: {
		enabled: true,
	},
	custom_insights_events: {
		enabled: true,
	},
	slow_sql: {
		enabled: true,
	},
	datastore_tracer: {
		database_name_reporting: {
			enabled: true,
		},
		instance_reporting: {
			enabled: true,
		},
	},
};
