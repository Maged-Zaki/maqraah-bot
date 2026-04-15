# Maqraah Bot

A Discord bot for running a daily maqraah reminder. It tracks Qur'an and Hadith progress, sends pre-reminder and main reminder messages, carries notes between sessions, and records simple attendance responses from reminder buttons.

## Features

- Daily maqraah reminders in a configured channel
- Optional pre-reminder stage before the main reminder
- Qur'an page and Hadith progress tracking
- Pending notes, notes history, delete-by-number, and carry-over support
- Reminder attendance buttons for "joining shortly" and "cannot make it"
- Optional voice channel name updates when the configured maqraah time changes
- SQLite persistence
- New Relic instrumentation when `NEW_RELIC_LICENSE_KEY` is set

## Setup

### Prerequisites

- Node.js 20 recommended
- A Discord application and bot token from the [Discord Developer Portal](https://discord.com/developers/applications)
- A Discord server, reminder text channel, and a writable path for the SQLite database

### Install

```bash
npm install
npm run build
```

Create a `.env` file:

```bash
DISCORD_TOKEN=your_discord_bot_token
GUILD_ID=your_discord_server_id
CHANNEL_ID=your_reminder_text_channel_id
DATABASE_PATH=./database.db
NEW_RELIC_LICENSE_KEY=optional_new_relic_license_key
```

Start the compiled bot:

```bash
npm start
```

For local development:

```bash
npm run dev
```

## Bot Permissions

The bot needs:

- View Channels
- Send Messages
- Use Slash Commands
- Manage Channels, only if you want `/configuration update time:...` to rename the configured voice channel

## Command Reference

Slash commands are discovered from `src/features/**/command.ts` and `src/features/**/*Command.ts`, then registered to the configured guild at startup. The legacy `src/commands/` directory is currently empty.

### `/configuration`

- `/configuration update [role] [voicechannel] [time] [timezone] [pre-reminder-enabled] [maqraah-reminder-enabled]`
  Updates bot configuration. `time` must use `HH:MM AM/PM`, for example `8:00 PM`. `timezone` must be an IANA timezone such as `Africa/Cairo`.
- `/configuration show`
  Shows reminder time, timezone, role, voice channel, and enabled reminder stages.

There is no `/configuration set` command in the current bot.

### `/progress`

- `/progress update [last-quran-page-read] [last-hadith]`
  Updates shared reading progress. Qur'an pages must be between 1 and 604, and Hadith numbers must be positive.
- `/progress show`
  Shows the current shared reading progress.

There is no `/progress set`, `/set-progress`, or `/show-progress` command in the current bot.

### `/notes`

- `/notes create text:<note>`
  Adds a pending note for the upcoming maqraah reminder.
- `/notes show-mine`
  Shows your pending notes.
- `/notes show-all`
  Shows all pending notes.
- `/notes delete numbers:<list>`
  Deletes pending notes by their position number. Use comma-separated numbers such as `1,2,3`. Positions are resolved against all pending notes sorted oldest first; they are not database IDs.
- `/notes delete-mine`
  Deletes all of your pending notes.
- `/notes delete-all`
  Deletes all notes for everyone.
- `/notes carry-over-last-notes`
  Moves notes that were included in the previous maqraah reminder back to `pending` so they appear in the upcoming reminder again.
- `/notes show-history day:<1-31> month:<1-12> year:<2000-2100>`
  Shows notes created or included on the requested date.

There is no `/notes add`, `/add-note`, `/notes remove-my`, or `/notes remove-all` command in the current bot.

### Reminder Utility

- `/change-upcoming-maqraah-time time:<HH:MM AM/PM>`
  Overrides the next main maqraah reminder time once, then returns to the configured daily schedule.

### Help

- `/help`
  Lists registered top-level slash commands.

### Missing Test Command

`/test` is documented in older README versions, but no current source command implements it. Use `/configuration show`, `/progress show`, or run the bot in a test server to validate configuration.

## Reminder Flow

At startup the bot registers slash commands, schedules reminders, and sends a welcome message to `CHANNEL_ID`.

The scheduler uses `dailyTime` and `timezone` from the database. By default, it sends:

- A pre-reminder 5 minutes before the maqraah time, if enabled
- The main maqraah reminder at the configured time, if enabled

The main reminder includes the next Qur'an page, next Hadith number, and reminder action buttons. Pending notes are sent as separate numbered note messages when present. After a main reminder includes pending notes, those notes are marked `included` and stamped with `lastIncludedDate`; they are not deleted automatically. Use `/notes carry-over-last-notes` to reuse included notes.

Reminder buttons record attendance in SQLite:

- `هتاخر شوية` records `late`
- `مش هقدر أحضر` records `cannot_make_it`

## Database Schema

SQLite is initialized in `src/infrastructure/database/index.ts`. `DATABASE_PATH` is required before the database module loads.

### `configuration`

Single-row table with `id = 1`.

| Column | Type | Default | Purpose |
| --- | --- | --- | --- |
| `id` | `INTEGER PRIMARY KEY` | `1` | Singleton row |
| `roleId` | `TEXT` | `'Not set'` | Role pinged by reminders |
| `dailyTime` | `TEXT` | `'12:00 PM'` | Main maqraah time |
| `timezone` | `TEXT` | `'Africa/Cairo'` | IANA timezone for scheduling |
| `voiceChannelId` | `TEXT` | `''` | Voice channel renamed when time changes |
| `preReminderEnabled` | `INTEGER` | `1` | Enables pre-reminder stage |
| `preReminderOffsetMinutes` | `INTEGER` | `5` | Minutes before main reminder |
| `mainReminderEnabled` | `INTEGER` | `1` | Enables main reminder stage |

### `progress`

Single-row table with `id = 1`.

| Column | Type | Default | Purpose |
| --- | --- | --- | --- |
| `id` | `INTEGER PRIMARY KEY` | `1` | Singleton row |
| `lastPage` | `INTEGER` | `0` | Last Qur'an page read |
| `lastHadith` | `INTEGER` | `0` | Last Hadith read |

### `notes`

| Column | Type | Purpose |
| --- | --- | --- |
| `id` | `INTEGER PRIMARY KEY AUTOINCREMENT` | Note ID |
| `userId` | `TEXT NOT NULL` | Discord user ID |
| `note` | `TEXT NOT NULL` | Note text |
| `dateAdded` | `TEXT NOT NULL` | ISO timestamp when created |
| `status` | `TEXT DEFAULT 'pending'` | `pending` or `included` |
| `lastIncludedDate` | `TEXT` | ISO timestamp when included in a reminder |

### `attendance`

| Column | Type | Purpose |
| --- | --- | --- |
| `id` | `INTEGER PRIMARY KEY AUTOINCREMENT` | Attendance row ID |
| `sessionId` | `TEXT NOT NULL` | Maqraah session date |
| `userId` | `TEXT NOT NULL` | Discord user ID |
| `status` | `TEXT NOT NULL` | Attendance response |
| `updatedAt` | `TEXT NOT NULL` | ISO update timestamp |

`attendance` has a unique constraint on `(sessionId, userId)`.

### `reminder_events`

| Column | Type | Purpose |
| --- | --- | --- |
| `id` | `INTEGER PRIMARY KEY AUTOINCREMENT` | Event row ID |
| `sessionId` | `TEXT NOT NULL` | Maqraah session date |
| `stage` | `TEXT NOT NULL` | `pre` or `main` |
| `scheduledFor` | `TEXT NOT NULL` | Intended reminder timestamp |
| `sentAt` | `TEXT NOT NULL` | Actual send timestamp |

`reminder_events` has a unique constraint on `(sessionId, stage)` to avoid duplicate reminder sends for the same session stage.

## Project Structure

```text
src/
  app/                    Discord startup, command registration, interaction routing
  features/
    configuration/        /configuration command
    help/                 /help command
    notes/                /notes command
    progress/             /progress command
    reminders/            reminder scheduling, messages, buttons, and override command
  infrastructure/
    database/             SQLite initialization and repositories
    logging/              Winston and New Relic logging helpers
  shared/                 small cross-feature helpers
```

`dist/` is generated by `npm run build`. The current command registry loads compiled command modules from `dist/features/`, not from the stale compiled `dist/commands/` directory.

## Deployment

### Current Reality

There is no `ecosystem.config.js` in this repository. Older docs mention one, but current deployment starts PM2 directly with `dist/index.js`.

The included GitHub Actions workflow at `.github/workflows/deploy.yml`:

- Ignores README and other markdown-only changes
- Copies the repository to `/home/ubuntu/app`
- Creates the SQLite database file from `DATABASE_PATH`
- Writes `.env` from GitHub secrets and variables
- Runs `npm install`
- Runs `npm run build`
- Runs `pm2 restart maqraah-bot || pm2 start dist/index.js --name maqraah-bot`

Manual deployment should match that:

```bash
npm install
npm run build
pm2 restart maqraah-bot || pm2 start dist/index.js --name maqraah-bot
pm2 save
```

### New Relic

`src/index.ts` imports `dotenv/config` and `newrelic`, so `npm start` runs with New Relic instrumentation when `NEW_RELIC_LICENSE_KEY` is present. The build script copies `newrelic.js` to `dist/newrelic.js`.

`npm run dev` also preloads New Relic with `ts-node -r newrelic src/index.ts`.

## Scripts

| Script | Description |
| --- | --- |
| `npm run build` | Compile TypeScript and copy `newrelic.js` to `dist/` |
| `npm test` | Build, then run compiled Node test files |
| `npm start` | Run `node dist/index.js` |
| `npm run dev` | Run the TypeScript source with nodemon and ts-node |

## Verification

For doc-only changes, run:

```bash
npm run build
```

To verify command coverage manually, compare the command reference above with command definitions in:

- `src/features/configuration/command.ts`
- `src/features/progress/command.ts`
- `src/features/notes/command.ts`
- `src/features/reminders/changeUpcomingMaqraahTimeCommand.ts`
- `src/features/help/command.ts`

Every slash command currently defined in source is documented above, and every documented command above has a matching source command. `/test` is explicitly marked missing.
