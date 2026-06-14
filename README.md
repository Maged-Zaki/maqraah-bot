# Maqraah Bot

A Discord bot for running a daily maqraah reminder. It tracks Qur'an and Hadith progress, sends pre-reminder and main reminder messages, carries notes between sessions, and records simple attendance responses from reminder buttons.

## Features

- Daily maqraah reminders in a configured channel
- Optional pre-reminder stage before the main reminder
- Optional automatic Maqraah time updates from Maghrib prayer time via AlAdhan
- Optional role-based fasting and Islamic event reminders
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
- Manage Roles, if you want users to subscribe to optional reminder categories
- Manage Channels, only if you want the bot to rename the configured voice channel when the Maqraah time changes

## Command Reference

Slash commands are discovered from `src/features/**/command.ts` and `src/features/**/*Command.ts`, then registered to the configured guild at startup.

### `/configuration`

- `/configuration update [role] [voicechannel] [maqraah-time] [timezone] [pre-reminder-enabled] [pre-reminder-minutes] [maqraah-reminder-enabled] [maqraah-time-sync-enabled] [maqraah-minutes-after-maghrib] [prayer-time-latitude] [prayer-time-longitude] [hifz-time] [hifz-reminder-enabled] [hifz-pre-reminder-enabled] [hifz-pre-reminder-minutes]`
  Updates bot configuration. `maqraah-time` must use `H:MM AM/PM`, such as `9:05 PM`, and is saved in normalized form. `timezone` must be an IANA timezone such as `Africa/Cairo`.
  The hifz (memorization) options are independent: `hifz-time` (defaults to `6:00 PM`), `hifz-reminder-enabled`, `hifz-pre-reminder-enabled`, and `hifz-pre-reminder-minutes` control the hifz reminder cadence, which reuses the same role, timezone, and reminder channel as the maqraah.
  When `maqraah-time-sync-enabled` is true, the bot checks AlAdhan prayer timings with the configured timezone and location, then sets `dailyTime` to the configured number of minutes after Maghrib. Maghrib is rounded down to the current 5-minute bucket, so `6:31 PM` through `6:34 PM` keeps the same Maqraah time as `6:30 PM`, while `6:35 PM` moves it.
- `/configuration show`
  Shows reminder time, timezone, role, voice channel, enabled reminder stages, Maqraah time sync settings, and hifz settings.

There is no `/configuration set` command in the current bot.

### `/maqraah`

- `/maqraah cannot-attend-upcoming-maqraah [dates]`
  Marks you as unable to attend. Without `dates`, this applies to the upcoming maqraah. `dates` accepts comma-separated maqraah session dates in `YYYY-MM-DD`, such as `2026-04-20, 2026-04-22`.
- `/maqraah will-be-late-upcoming-maqraah`
  Marks you as arriving late for the upcoming maqraah.
- `/maqraah clear-upcoming-maqraah-status [dates]`
  Clears your saved preregistration. Without `dates`, this applies to the upcoming maqraah. `dates` accepts the same comma-separated `YYYY-MM-DD` format.

### `/maqraah progress`

- `/maqraah progress update [page] [hadith]`
  Updates shared current reading progress. Qur'an pages must be between 1 and 604, and Hadith numbers must be positive.
- `/maqraah progress show`
  Shows the current shared reading progress.

There is no top-level `/progress`, `/progress set`, `/set-progress`, or `/show-progress` command in the current bot.

### `/hifz`

Hifz is a group Qur'an memorization (حِفْظ) feature that mirrors the maqraah flow but runs on its own reminder time. It shares the reminder role, timezone, channel, and notes with the maqraah, and tracks a separate memorization page.

- `/hifz cannot-attend-upcoming-hifz`
  Marks you as unable to attend the upcoming hifz.
- `/hifz will-be-late-upcoming-hifz`
  Marks you as arriving late for the upcoming hifz.
- `/hifz clear-upcoming-hifz-status`
  Clears your saved preregistration for the upcoming hifz.

### `/hifz progress`

- `/hifz progress update [page]`
  Updates the shared memorization page. Qur'an pages must be between 1 and 604.
- `/hifz progress show`
  Shows the current memorization progress and setup status.
- `/hifz progress post-current-page`
  Posts the current memorization page prompt (with prev/next navigation) to the reminder channel.

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

- `/change-upcoming-maqraah-time time:<H:MM AM/PM>`
  Overrides the next main maqraah reminder time once, then returns to the configured daily schedule.
- `/change-upcoming-hifz-time time:<H:MM AM/PM>`
  Overrides the next main hifz reminder time once, then returns to the configured hifz schedule.

### `/reminders`

- `/reminders subscribe category:<fasting|islamic-events>`
  Adds the matching reminder role to you. The bot creates or relinks the category role when needed.
- `/reminders unsubscribe category:<fasting|islamic-events>`
  Removes the matching reminder role from you.
- `/reminders list`
  Shows your current optional reminder subscriptions.
- `/reminders configuration show`
  Shows the global optional-reminder configuration, including the channel where reminders are sent.
- `/reminders configuration update [time] [channel]`
  Updates the optional-reminder send time or channel. `time` accepts `H:MM AM/PM`, such as `6:00 PM`, or `sync-to-<name>`, such as `sync-to-isha`. Supported sync names are `fajr`, `sunrise`, `dhuhr`, `asr`, `maghrib`, and `isha`. Event lead times are hard-coded in the bot.

### Help

- `/help`
  Lists registered top-level slash commands.

### Missing Test Command

`/test` is documented in older README versions, but no current source command implements it. Use `/configuration show`, `/maqraah progress show`, or run the bot in a test server to validate configuration.

## Reminder Flow

At startup the bot registers slash commands, schedules reminders, and sends a welcome message to `CHANNEL_ID`.

The scheduler uses `dailyTime` and `timezone` from the database. By default, it sends:

- A pre-reminder 5 minutes before the maqraah time, if enabled
- The main maqraah reminder at the configured time, if enabled

If Maqraah time sync is enabled, the bot checks once an hour at minute 7 in the configured timezone. On startup and after relevant configuration changes, it also checks immediately. When the sync changes the configured Maqraah time, it announces the change in the reminder channel with the configured role mention. API failures are logged and retried by the regular checker.

The main reminder includes the current Qur'an page, current Hadith number, and reminder action buttons. Pending notes are sent as separate numbered note messages when present. After a main reminder includes pending notes, those notes are marked `included` and stamped with `lastIncludedDate`; they are not deleted automatically. Use `/notes carry-over-last-notes` to reuse included notes.

Optional subscription reminders are separate from maqraah reminders. They use Discord roles named `تذكيرات الصيام` and `تذكيرات المناسبات الإسلامية`, send to the configured optional-reminder channel, and mention only the target category role through `allowedMentions`. They can send at a fixed clock time or sync to a configured daily prayer time through AlAdhan using the global timezone, latitude, longitude, and calculation method. Each reminder has a hard-coded lead time; for example Monday/Thursday fasting reminders are sent one day before, and the six Shawwal reminder is sent once on Eid al-Fitr day for fasting from the next day. Hijri dates are resolved through AlAdhan's Islamic calendar API and cached for the current and next Gregorian month; send-time checks use the cached calendar and skip Hijri-based reminders if no cached date is available.

Reminder buttons record attendance in SQLite:

- `هتاخر شوية` records `late`
- `مش هقدر أحضر` records `cannot_make_it`

## Database Schema

SQLite is initialized in `src/storage/sqlite/index.ts`. `DATABASE_PATH` is required before the database module loads. Schema changes are managed through ordered TypeScript migration files in `src/storage/sqlite/migrations/`. Migrations run automatically at startup inside transactions; there is no separate `db:migrate` command. The `migrations` table tracks which migrations have been applied.

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
| `maqraahTimeSyncEnabled` | `INTEGER` | `0` | Enables automatic Maqraah time updates from Maghrib |
| `maqraahTimeSyncOffsetMinutes` | `INTEGER` | `30` | Minutes after Maghrib for the Maqraah time |
| `maqraahTimeSyncLatitude` | `REAL` | `30.0444` | Latitude passed to AlAdhan |
| `maqraahTimeSyncLongitude` | `REAL` | `31.2357` | Longitude passed to AlAdhan |
| `maqraahTimeSyncCalculationMethod` | `INTEGER` | `5` | AlAdhan calculation method id |
| `hifzTime` | `TEXT` | `'6:00 PM'` | Main hifz (memorization) reminder time |
| `hifzReminderEnabled` | `INTEGER` | `1` | Enables hifz main reminder stage |
| `hifzPreReminderEnabled` | `INTEGER` | `1` | Enables hifz pre-reminder stage |
| `hifzPreReminderOffsetMinutes` | `INTEGER` | `5` | Minutes before hifz to send the pre-reminder |

### `progress`

Single-row table with `id = 1`.

| Column | Type | Default | Purpose |
| --- | --- | --- | --- |
| `id` | `INTEGER PRIMARY KEY` | `1` | Singleton row |
| `currentPage` | `INTEGER` | `1` | Current Qur'an page |
| `currentHadith` | `INTEGER` | `1` | Current Hadith number |

### `hifz_progress`

Single-row table with `id = 1`. Tracks the group memorization pointer, independent of maqraah reading progress.

| Column | Type | Default | Purpose |
| --- | --- | --- | --- |
| `id` | `INTEGER PRIMARY KEY` | `1` | Singleton row |
| `currentPage` | `INTEGER` | `1` | Current memorization Qur'an page (1-604) |

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
| `sessionId` | `TEXT NOT NULL` | Session id (`YYYY-MM-DD` for maqraah, `hifz-YYYY-MM-DD` for hifz) |
| `userId` | `TEXT NOT NULL` | Discord user ID |
| `status` | `TEXT NOT NULL` | Attendance response |
| `updatedAt` | `TEXT NOT NULL` | ISO update timestamp |

`attendance` has a unique constraint on `(sessionId, userId)`.

### `reminder_events`

| Column | Type | Purpose |
| --- | --- | --- |
| `id` | `INTEGER PRIMARY KEY AUTOINCREMENT` | Event row ID |
| `sessionId` | `TEXT NOT NULL` | Session id (`YYYY-MM-DD` for maqraah, `hifz-YYYY-MM-DD` for hifz) |
| `stage` | `TEXT NOT NULL` | `pre` or `main` |
| `scheduledFor` | `TEXT NOT NULL` | Intended reminder timestamp |
| `sentAt` | `TEXT NOT NULL` | Actual send timestamp |

`reminder_events` has a unique constraint on `(sessionId, stage)` to avoid duplicate reminder sends for the same session stage.

### `reminder_category_roles`

| Column | Type | Purpose |
| --- | --- | --- |
| `categoryKey` | `TEXT PRIMARY KEY` | Reminder category key |
| `roleId` | `TEXT NOT NULL` | Discord role ID used for subscriptions |
| `roleName` | `TEXT NOT NULL` | Expected role name |
| `createdAt` | `TEXT NOT NULL` | ISO creation timestamp |
| `updatedAt` | `TEXT NOT NULL` | ISO update timestamp |

### `reminder_settings`

| Column | Type | Purpose |
| --- | --- | --- |
| `id` | `INTEGER PRIMARY KEY` | Singleton row |
| `channelId` | `TEXT NOT NULL` | Channel for optional reminders |
| `daysBefore` | `INTEGER NOT NULL` | Legacy unused column; per-event lead times are hard-coded |
| `sendTime` | `TEXT NOT NULL` | Fixed daily send time retained for fixed mode |
| `sendTimeMode` | `TEXT NOT NULL` | `fixed` or `prayer` |
| `sendPrayer` | `TEXT` | Prayer name for prayer-sync mode |
| `updatedAt` | `TEXT NOT NULL` | ISO update timestamp |

### `hijri_calendar_cache`

| Column | Type | Purpose |
| --- | --- | --- |
| `gregorianDate` | `TEXT PRIMARY KEY` | Gregorian date in `YYYY-MM-DD` |
| `hijriYear` | `INTEGER NOT NULL` | Hijri year |
| `hijriMonth` | `INTEGER NOT NULL` | Hijri month number |
| `hijriDay` | `INTEGER NOT NULL` | Hijri day |
| `hijriMonthNameAr` | `TEXT NOT NULL` | Arabic Hijri month name |
| `hijriMonthNameEn` | `TEXT NOT NULL` | English Hijri month name |
| `provider` | `TEXT NOT NULL` | Calendar provider name |
| `fetchedAt` | `TEXT NOT NULL` | ISO fetch timestamp |

### `subscription_reminder_events`

| Column | Type | Purpose |
| --- | --- | --- |
| `eventKey` | `TEXT PRIMARY KEY` | Unique sent reminder occurrence |
| `categoryKey` | `TEXT NOT NULL` | Reminder category key |
| `targetRoleId` | `TEXT NOT NULL` | Role mentioned by the reminder |
| `scheduledFor` | `TEXT NOT NULL` | Scheduled send timestamp |
| `sentAt` | `TEXT NOT NULL` | Actual send timestamp |

### `migrations`

| Column | Type | Purpose |
| --- | --- | --- |
| `id` | `INTEGER PRIMARY KEY AUTOINCREMENT` | Migration row ID |
| `name` | `TEXT NOT NULL UNIQUE` | Migration identifier, e.g. `001_initial_schema` |
| `appliedAt` | `TEXT NOT NULL` | ISO timestamp when the migration was applied |

## Project Structure

```text
src/
  app/                    Discord startup, command registration, interaction routing
  features/
    configuration/        /configuration command
    help/                 /help command
    maqraah/              /maqraah command, progress dashboard, attendance, and reminders
    notes/                /notes command
    schedule/             /schedule command
    setup/                /setup command and first-run setup guide
    subscriptionReminders/ /reminders command, role subscriptions, calendar cache, scheduler
  storage/
    sqlite/               SQLite initialization, migrations, and repositories
  observability/
    logging/              Winston and New Relic logging helpers
  shared/                 small cross-feature helpers
```

Agents should start with `AGENTS.md` for the source map and feature workflow.

`dist/` is generated by `npm run build`. The current command registry loads compiled command modules from `dist/features/`.

## Database Migrations

Migrations are TypeScript files in `src/storage/sqlite/migrations/`. They run automatically at startup in order, each inside a transaction. The runner skips migrations that have already been applied (tracked in the `migrations` table). If a migration fails, it is rolled back and the bot exits with an error.

### Adding a New Migration

1. Create `src/storage/sqlite/migrations/{NNN}_{descriptive_name}.ts`:

```ts
import sqlite3 from 'sqlite3';
import type { Migration } from './types';

export const migration002: Migration = {
	name: '002_add_column',
	async up(db: sqlite3.Database): Promise<void> {
		await run(db, `ALTER TABLE configuration ADD COLUMN newField TEXT DEFAULT ''`);
	},
};

function run(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<void> {
	return new Promise((resolve, reject) => {
		db.run(sql, params, (err) => (err ? reject(err) : resolve()));
	});
}
```

2. Add the migration to the `migrations` array in `src/storage/sqlite/migrations/runner.ts`.
3. Use `IF NOT EXISTS` and `INSERT OR IGNORE` to keep migrations idempotent for existing databases.
4. Run `npm test` to verify.

There is no separate `db:migrate` command; migrations run when the bot starts.

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
- `src/features/maqraah/command.ts`
- `src/features/maqraah/reminders/changeUpcomingMaqraahTimeCommand.ts`
- `src/features/notes/command.ts`
- `src/features/schedule/command.ts`
- `src/features/setup/command.ts`
- `src/features/help/command.ts`

Use those source files as the current slash command inventory when updating this reference. `/test` is explicitly marked missing.
