# Maqraah Bot

A Discord bot designed to help users track their daily Qur'an and Hadith reading progress. The bot sends automated reminders, tracks reading progress, and manages personal notes for the group to remember for the next day.

## Features

- **Daily Reminders**: Automated daily reminders for Qur'an and Hadith reading at customizable times
- **Progress Tracking**: Track last read Qur'an page and Hadith number
- **Flexible Configuration**: Set reminder times, timezones, roles to ping, and voice channels
- **Notes System**: Add personal notes to be reminded the next day
- **Voice Channel Integration**: Automatically update voice channel names with reminder times
- **SQLite Database**: Persistent storage for all data
- **Slash Commands**: Modern Discord slash command interface

## Installation

### Prerequisites

- Node.js (v16 or higher)
- A Discord bot token (create one at [Discord Developer Portal](https://discord.com/developers/applications))

### Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/yourusername/maqraah-bot.git
   cd maqraah-bot
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Build the project**

   ```bash
   npm run build
   ```

4. **Configure environment variables**
   - Copy `.env.example` to `.env`
   - Fill in your bot credentials in `.env`

## Configuration

The bot requires the following environment variables:

### Required Environment Variables

- `DISCORD_TOKEN`: Your Discord bot token
- `GUILD_ID`: The ID of your Discord server (guild)
- `CHANNEL_ID`: The ID of the text channel where reminders will be sent
- `DATABASE_PATH`: Path to the SQLite database file (e.g., `./maqraah.db`)

### Optional Environment Variables (New Relic Monitoring)

- `NEW_RELIC_LICENSE_KEY`: Your New Relic license key for application monitoring

See the [Monitoring with New Relic](#monitoring-with-new-relic) section for more details.

### Bot Permissions

Ensure your bot has the following permissions in your Discord server:

- Send Messages
- Use Slash Commands
- View Channels
- Manage Channels (for voice channel name updates)

## Commands

### Configuration Commands

- `/configuration set`
  - Configure bot settings
  - Options:
    - `role`: Role to ping for reminders
    - `voicechannel`: Voice channel to update with time
    - `time`: Daily reminder time (HH:MM AM/PM format)
    - `timezone`: Timezone for reminders (e.g., "Africa/Cairo")

- `/configuration show`
  - Display current bot configuration settings

### Progress Commands

- `/progress set`
  - Set your current reading progress
  - Options:
    - `last-quran-page`: Last Qur'an page read
    - `last-hadith`: Last Hadith read

- `/progress show`
  - Display current reading progress

### Notes Commands

- `/notes add`
  - Add a personal note to be reminded tomorrow
  - Options:
    - `text`: The note content (required)

- `/notes show-my`
  - Show your personal notes

- `/notes show-all`
  - Show all notes from all users

- `/notes remove-my`
  - Remove all your personal notes

- `/notes remove-all`
  - Remove all notes from all users (admin command)

### Utility Commands

- `/help`
  - List all available commands

- `/test`
  - Send a test reminder message with current configuration

## How It Works

### Daily Reminders

The bot sends a daily reminder message in the configured channel at the specified time. The reminder includes:

- The next Qur'an page to read (with a direct link to quran.com)
- The next Hadith number
- Any personal notes added by users

Example reminder message:

```
@Role
Page: [605](https://quran.com/page/605)
Hadith: 1501

Notes:
@user1: Remember to reflect on the verses
@user2: Focus on memorization today
```

### Progress Tracking

Users can set their reading progress using `/set-progress`. The bot uses this information to calculate the next page/Hadith for reminders.

### Notes System

Users can add notes using `/add-note`. These notes are stored and included in the next day's reminder, then automatically cleared.

### Voice Channel Updates

If configured, the bot can update a voice channel's name to display the current reminder time in Arabic (e.g., "مقراة الساعة 12:00 PM").

## Usage Examples

### Initial Setup

1. Invite the bot to your server
2. Set environment variables
3. Start the bot: `npm start`
4. Configure the bot:
   ```
   /configuration set role:@Readers time:8:00 AM timezone:America/New_York
   ```

### Daily Workflow

1. Set your progress: `/set-progress lastpage:150 lasthadith:500`
2. Add a note: `/add-note text:Focus on understanding the context`
3. Check progress: `/show-progress`
4. Receive daily reminder at configured time

## Development

### Running in Development

```bash
npm run dev
```

This uses `ts-node` to run the TypeScript code directly without building. New Relic is automatically loaded via the `-r newrelic` flag.

### Available Scripts

| Script          | Description                                                  |
| --------------- | ------------------------------------------------------------ |
| `npm run dev`   | Run in development mode with hot-reload (includes New Relic) |
| `npm run build` | Compile TypeScript and copy `newrelic.js` to `dist/`         |
| `npm start`     | Run the compiled application (includes New Relic)            |

## Monitoring with New Relic

This bot includes built-in New Relic monitoring for application performance tracking, error reporting, and logging.

### Setup

1. **Get a New Relic License Key**
   - Sign up at [New Relic](https://newrelic.com/)
   - Copy your license key from Account Settings

2. **Add to Environment Variables**

   ```bash
   NEW_RELIC_LICENSE_KEY=your_license_key_here
   ```

3. **Configuration File**
   The [`newrelic.js`](newrelic.js) file contains New Relic configuration:
   - Application name: `maqraah-bot`
   - Distributed tracing enabled
   - Application logging enabled
   - Error collection enabled

### How New Relic is Loaded

New Relic must be loaded **before** the application starts. This is done using Node's `-r` (require) flag:

```bash
node -r newrelic dist/index.js
```

This approach is used in:

- **Development**: `npm run dev` runs `ts-node -r newrelic src/index.ts`
- **Production**: `npm start` runs `node -r newrelic dist/index.js`
- **PM2**: The [`ecosystem.config.js`](ecosystem.config.js) includes `node_args: '-r newrelic'`

### Why `newrelic.js` is Copied to `dist/`

The `newrelic.js` file is a JavaScript configuration file, not TypeScript. The TypeScript compiler (`tsc`) only processes `.ts` files from `src/`. Therefore:

1. The build script copies `newrelic.js` to `dist/`:

   ```json
   "build": "tsc && cp newrelic.js dist/newrelic.js"
   ```

2. New Relic automatically looks for `newrelic.js` in the current working directory when loaded

### What's Monitored

- **Command Execution**: Each Discord slash command is tracked as a transaction
- **Error Tracking**: Uncaught exceptions and command errors are reported
- **Custom Attributes**: User ID, guild ID, command name, and duration
- **Logging**: All logs are forwarded to New Relic with context

### Disabling New Relic

To disable New Relic monitoring:

1. Remove `NEW_RELIC_LICENSE_KEY` from your environment variables
2. Or set `NEW_RELIC_ENABLED=false` in your environment

### Project Structure

```
├── src/                    # TypeScript source files
│   ├── index.ts           # Main bot file
│   ├── database.ts        # SQLite database operations
│   ├── scheduler.ts       # Cron job scheduling
│   ├── utils.ts           # Utility functions
│   ├── logger.ts          # Winston logger with New Relic integration
│   ├── commands/          # Slash command implementations
│   │   ├── configuration.ts
│   │   ├── progress.ts
│   │   ├── notes.ts
│   │   ├── help.ts
│   │   └── change-upcoming-maqraah-time.ts
│   └── repositories/      # Data access layer
│       ├── ConfigurationRepository.ts
│       ├── NotesRepository.ts
│       └── ProgressRepository.ts
├── dist/                   # Compiled JavaScript (generated)
├── newrelic.js            # New Relic configuration
├── ecosystem.config.js    # PM2 process configuration
├── package.json           # Project dependencies and scripts
├── tsconfig.json          # TypeScript configuration
└── .env                   # Environment variables (not in repo)
```

### Database Schema

The bot uses SQLite with two tables:

**config** (single row):

- `lastPage`: Last Qur'an page read
- `lastHadith`: Last Hadith read
- `roleId`: Discord role ID for pinging
- `dailyTime`: Reminder time (HH:MM AM/PM)
- `timezone`: IANA timezone identifier
- `voiceChannelId`: Voice channel ID for updates

**notes**:

- `id`: Auto-incrementing primary key
- `userId`: Discord user ID
- `note`: Note text
- `dateAdded`: ISO timestamp

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Production Deployment

### PM2 Configuration

The bot uses PM2 for process management in production. The [`ecosystem.config.js`](ecosystem.config.js) file configures:

- **Application name**: `maqraah-bot`
- **Node arguments**: `-r newrelic` (loads New Relic before startup)
- **Auto-restart**: Enabled on crashes
- **Instances**: 1 (single instance for Discord bot)
- **Log management**: Merged logs with timestamps

### Manual Deployment

```bash
# Build the application
npm run build

# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 configuration (for auto-restart on reboot)
pm2 save

# View logs
pm2 logs maqraah-bot

# Monitor
pm2 monit
```

### GitHub Actions Deployment

The repository includes a GitHub Actions workflow ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)) that:

1. Triggers on push to `main` branch
2. Syncs files to the remote server via rsync
3. Creates the `.env` file from GitHub secrets
4. Installs dependencies and builds the application
5. Restarts or starts the PM2 process

#### Required GitHub Secrets

| Secret                  | Description                       |
| ----------------------- | --------------------------------- |
| `SSH_KEY`               | SSH private key for server access |
| `SSH_HOST`              | Server hostname or IP             |
| `DISCORD_TOKEN`         | Discord bot token                 |
| `GUILD_ID`              | Discord server ID                 |
| `CHANNEL_ID`            | Discord channel ID                |
| `NEW_RELIC_LICENSE_KEY` | New Relic license key             |

#### Required GitHub Variables

| Variable        | Description                  |
| --------------- | ---------------------------- |
| `DATABASE_PATH` | Path to SQLite database file |

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support or questions:

- Open an issue on GitHub
- Check the Discord server where the bot is running

## Acknowledgments

- Built with [Discord.js](https://discord.js.org/)
- Uses [node-cron](https://www.npmjs.com/package/node-cron) for scheduling
- SQLite for data persistence
- Monitoring by [New Relic](https://newrelic.com/)

## Troubleshooting

### New Relic Not Working

If New Relic is not receiving data:

1. **Check environment variable**: Ensure `NEW_RELIC_LICENSE_KEY` is set
2. **Check file location**: `newrelic.js` should be in the same directory where you run the app
3. **Check startup logs**: Look for New Relic connection messages in the console
4. **Verify `-r newrelic` flag**: This must be included when starting the app

```bash
# Correct way to start (includes New Relic)
node -r newrelic dist/index.js

# Incorrect (New Relic won't be loaded)
node dist/index.js
```

### PM2 Not Loading New Relic

If PM2 isn't loading New Relic:

1. **Use ecosystem.config.js**: Don't start with `pm2 start dist/index.js`
2. **Check node_args**: Ensure `node_args: '-r newrelic'` is in the config
3. **Restart PM2**: After config changes, run `pm2 delete maqraah-bot && pm2 start ecosystem.config.js`

### Build Issues

If `newrelic.js` is missing from `dist/`:

```bash
# The build script handles this automatically
npm run build

# Or manually copy
cp newrelic.js dist/newrelic.js
```

### TypeScript Cannot Include newrelic.js

This is expected behavior. The TypeScript compiler (`tsc`) only processes `.ts` files. The `newrelic.js` file is a JavaScript configuration file that must be copied separately. This is why the build script includes `cp newrelic.js dist/newrelic.js`.
