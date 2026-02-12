/**
 * PM2 Ecosystem Configuration
 *
 * This configuration file ensures New Relic is loaded before the application
 * by using the -r (require) flag. This is the recommended way to load New Relic.
 *
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 restart ecosystem.config.js
 *   pm2 stop ecosystem.config.js
 *   pm2 delete ecosystem.config.js
 */

module.exports = {
	apps: [
		{
			name: 'maqraah-bot',
			script: 'dist/index.js',
			// Load New Relic before the application starts
			node_args: '-r newrelic',
			// Environment variables
			env: {
				NODE_ENV: 'production',
			},
			// Auto-restart on crash
			autorestart: true,
			// Number of instances (1 for a Discord bot to avoid conflicts)
			instances: 1,
			// Don't use cluster mode for Discord bots
			exec_mode: 'fork',
			// Graceful shutdown timeout
			kill_timeout: 5000,
			// Wait for app to be ready
			wait_ready: false,
			// Listen for timeout
			listen_timeout: 3000,
			// Logging
			log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
			// Merge logs from all instances
			merge_logs: true,
		},
	],
};
