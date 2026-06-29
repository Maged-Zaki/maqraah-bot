# Maqraah Bot Agents Guide

<!-- IMPORTANT: When making changes to the codebase (adding commands, tables, migrations, features, or configuration),
     always update AGENTS.md, README.md, and any related documentation to stay in sync.
     Out-of-date docs are a bug. -->

<!-- hash updated after fasting subcategories role name changes -->

## 1. Project Identity

Maqraah Bot is a Discord bot for running a daily maqraah: it sends daily reading reminders, tracks Qur'an and Hadith progress, carries notes into reminders, records attendance responses, and manages additional generic schedules. The codebase is a TypeScript Node.js app using discord.js, SQLite, node-cron, Winston, and optional New Relic instrumentation.

- Bot name: Maqraah Bot (`package.json` name: `maqraah-bot`).
- Current version: `1.0.0`; release date is not declared in the repo. `package.json` was last modified on 2026-04-16.
- Invite URL pattern: `https://discord.com/oauth2/authorize?client_id=<CLIENT_ID>&scope=bot%20applications.commands&permissions=3072`. Add `Manage Channels` if voice channel renaming is enabled, making the permissions integer `3088`.
- Support server link: not documented in this repository.
- Bot library: `discord.js` exact installed version `14.25.1` (`package.json` allows `^14.25.1`).
- Runtime: no `.nvmrc` or `.tool-versions`. CI uses Node.js `22`; local inspection used Node.js `v22.22.0`. README says Node.js 20 is recommended.
- Gateway intents: `GatewayIntentBits.Guilds` only, created in `src/app/bot.ts`.
- Intent justification: `Guilds` is required for slash command interactions, guild command registration, guild cache lookup, channel/role lookup, and the `guildCreate` listener.
- Privileged intents: none. `MESSAGE_CONTENT`, `GUILD_MEMBERS`, and `GUILD_PRESENCES` are not enabled and are not needed by the current feature set.

## 2. Repository Layout

```text
src/                         source TypeScript
  app/                       Discord client bootstrap, command registration, interaction routing
  features/                  user-facing feature modules and their tests
    configuration/           /configuration command for role/time/timezone/reminder settings
    help/                    /help command
    hifz/                    /hifz command, memorization progress dashboard, reminders, attendance
    maqraah/                 /maqraah command, progress dashboard, reminders, attendance
    notes/                   /notes command, search, destructive delete confirmations
    schedule/                /schedule command, generic schedule resolver and cron runner
    setup/                   /setup guide command and first-run startup guide
  observability/             Winston/New Relic logging wrapper
    logging/                 structured logger and tests
  storage/                   persistence layer
    sqlite/                  SQLite bootstrap and repository instances
      migrations/            ordered TypeScript migration files and runner
      repositories/          table-specific repository classes and tests
  shared/                    cross-feature helpers with no feature ownership
    confirmations/           in-memory destructive confirmation button workflow
    content/                 message chunking helper
    prayerSync/              shared AlAdhan prayer-time lookup and time-sync math
    quran/                   Qur'an page metadata helpers
    time/                    time/timezone parsing helpers
dist/                        generated CommonJS build output from `npm run build`; ignored by git
.github/
  workflows/                 GitHub Actions CI and SSH/PM2 deployment workflow
plans/                       planning notes; ignored by git
node_modules/                installed dependencies; ignored by git
database.db                  local SQLite database; ignored by git
newrelic.js                  New Relic agent configuration copied into dist during build
package.json                 npm metadata, dependencies, scripts
package-lock.json            npm lockfile
tsconfig.json                TypeScript compiler configuration
.env.example                 documented environment variables
.env                         local secrets; ignored by git
README.md                    user-facing setup, command, schema, and deployment reference
CLAUDE.md                    compatibility pointer; currently references `AGENTS.md`
```

There is no separate `db/`, Dockerfile, Docker Compose file, Fly/Railway config, PM2 ecosystem file, or systemd unit in the current repository. Schema changes are managed through ordered TypeScript migration files in `src/storage/sqlite/migrations/`.

## 3. Architecture

The app starts in `src/index.ts`, loads `dotenv/config` and `newrelic`, then calls `startBot()` from `src/app/bot.ts`. `startBot()` validates required env vars, constructs a `discord.js` client with only the `Guilds` intent, registers lifecycle handlers, and logs in with `DISCORD_TOKEN`. On `clientReady`, it awaits `dbReady` (the migration promise from `src/storage/sqlite/index.ts`), discovers command modules from the compiled `dist/features` tree, registers them to the configured guild, starts the maqraah time sync cron, starts maqraah reminders, starts hifz time sync, starts hifz reminders, starts generic schedules, and sends the first-run setup guide if it has not been sent. The storage module opens SQLite as a singleton at import time, runs pending migrations, and exports repository singletons used directly by feature modules.

- Command loading strategy: dynamic CommonJS `require()` scan from compiled `dist/features/**/command.js` and `dist/features/**/*Command.js`.
- Event bus pattern: direct `client.once()` and `client.on()` calls in `src/app/bot.ts`; there is no event module auto-loader.
- Middleware chain: no formal middleware layer. `src/app/interactionRouter.ts` routes buttons first, then chat input commands, wraps command execution in New Relic and try/catch, and logs success/failure.
- Module boundary rule: feature commands own Discord interaction parsing and user replies; repositories own SQLite queries; `shared/` holds reusable pure or low-Discord helpers; observability code lives under `src/observability`.
- Shard setup: none. There is no `ShardingManager`, shard count strategy, or IPC layer.
- Worker threads: none. Cron jobs and command handlers run in the Node.js process.
- Scheduler pattern: `node-cron` jobs are held in module-level arrays and stopped/rebuilt when configuration or schedules change.

Dependency graph for a typical slash command:

```text
Discord API
-> Gateway interactionCreate
-> src/app/interactionRouter.ts
-> command collection on client
-> feature command execute()
-> feature helper/service modules
-> src/storage/sqlite repositories
-> SQLite database / external API if needed
-> reply or followUp payload
-> Discord API
```

Modules with the highest downstream blast radius:

- `src/storage/sqlite/index.ts`: runs migrations, creates `db` singleton, and exports all repository singletons.
- `src/app/interactionRouter.ts`: routes every button and slash command interaction.
- `src/app/commandRegistry.ts`: discovers and guild-registers every slash command.
- `src/shared/time.ts`: parses reminder times and validates timezones for configuration, reminders, and schedules.

## 4. Tech Stack

| Layer | Technology | Version | Notes |
| --- | --- | --- | --- |
| Runtime | Node.js | 22 in CI, local v22.22.0, README recommends 20 | No runtime pin file. |
| Language | TypeScript | 5.3.3 | Compiles to CommonJS in `dist/`. |
| Bot library | discord.js | 14.25.1 | Guild commands and interactions. |
| Database | SQLite via sqlite3 | sqlite3 5.1.7 installed | Single `sqlite3.Database`; no pool. |
| Cache | None | n/a | Uses Discord.js caches and in-process maps only. |
| Queue | None | n/a | Cron callbacks send directly. |
| Scheduler | node-cron | 3.0.3 | Maqraah/hifz reminders, time sync, generic schedules. |
| Observability | Winston, New Relic | winston 3.19.0, newrelic 13.12.0 | New Relic active when license key is present. |
| Hosting | Remote VPS over SSH | n/a | GitHub Actions rsyncs to `/home/ubuntu/app`. |
| Process mgr | PM2 direct command | n/a | No `ecosystem.config.js`. |
| CI/CD | GitHub Actions | workflow `deploy.yml` | Runs tests, deploys on `main`, ignores markdown-only changes. |

## 5. Discord Structure

### Slash Commands

| Name | Description | Options (name:type:required) | Permissions | Scope | File |
| --- | --- | --- | --- | --- | --- |
| `/configuration update` | Update shared configuration (timezone, prayer location) | `timezone:string:no`, `prayer-time-latitude:number:no`, `prayer-time-longitude:number:no`, `prayer-calculation-method:integer:no` | No command permission enforced | Guild from `GUILD_ID` | `src/features/configuration/command.ts` |
| `/configuration show` | Display current shared configuration | none | No command permission enforced | Guild | `src/features/configuration/command.ts` |
| `/help` | List all available commands | none | No command permission enforced | Guild | `src/features/help/command.ts` |
| `/hifz cannot-attend-upcoming-hifz` | Preregister unable to attend upcoming hifz | none | No command permission enforced | Guild | `src/features/hifz/command.ts` |
| `/hifz will-be-late-upcoming-hifz` | Preregister arriving late to hifz | none | No command permission enforced | Guild | `src/features/hifz/command.ts` |
| `/hifz clear-upcoming-hifz-status` | Clear preregistered hifz attendance status | none | No command permission enforced | Guild | `src/features/hifz/command.ts` |
| `/hifz progress update` | Update shared memorization progress | `page:integer:no` | No command permission enforced | Guild | `src/features/hifz/command.ts`, `src/features/hifz/progress/handler.ts` |
| `/hifz progress show` | Show hifz memorization progress and setup status | none | No command permission enforced | Guild | `src/features/hifz/command.ts`, `src/features/hifz/progress/handler.ts` |
| `/hifz progress post-current-page` | Post the current memorization page prompt | none | No command permission enforced | Guild | `src/features/hifz/command.ts`, `src/features/hifz/progress/handler.ts` |
| `/hifz progress post-current-page` | Post the current memorization page prompt | none | No command permission enforced | Guild | `src/features/hifz/command.ts`, `src/features/hifz/progress/handler.ts` |
| `/hifz configuration update` | Update hifz configuration | `hifz-enabled:boolean:no`, `hifz-role:role:no`, `hifz-time:string:no`, `hifz-reminder-enabled:boolean:no`, `hifz-pre-reminder-enabled:boolean:no`, `hifz-pre-reminder-minutes:integer:no`, `hifz-time-sync-enabled:boolean:no`, `hifz-time-sync-prayer:string:no`, `hifz-minutes-after-prayer:integer:no` | No command permission enforced | Guild | `src/features/hifz/command.ts`, `src/features/hifz/configurationCommand.ts` |
| `/hifz configuration show` | Display current hifz configuration | none | No command permission enforced | Guild | `src/features/hifz/command.ts`, `src/features/hifz/configurationCommand.ts` |
| `/change-upcoming-hifz-time` | Change the next hifz reminder time once | `time:string:yes` | No command permission enforced | Guild | `src/features/hifz/reminders/changeUpcomingHifzTimeCommand.ts` |
| `/maqraah cannot-attend-upcoming-maqraah` | Preregister unable to attend upcoming maqraah | none | No command permission enforced | Guild | `src/features/maqraah/command.ts` |
| `/maqraah will-be-late-upcoming-maqraah` | Preregister arriving late | none | No command permission enforced | Guild | `src/features/maqraah/command.ts` |
| `/maqraah clear-upcoming-maqraah-status` | Clear preregistered attendance status | none | No command permission enforced | Guild | `src/features/maqraah/command.ts` |
| `/maqraah progress update` | Update shared reading progress | `page:integer:no`, `hadith:integer:no` | No command permission enforced | Guild | `src/features/maqraah/command.ts`, `src/features/maqraah/progress/handler.ts` |
| `/maqraah progress show` | Show maqraah progress and setup status | none | No command permission enforced | Guild | `src/features/maqraah/command.ts`, `src/features/maqraah/progress/handler.ts` |
| `/maqraah progress post-current-page` | Post the current Qur'an reading page prompt | none | No command permission enforced | Guild | `src/features/maqraah/command.ts`, `src/features/maqraah/progress/handler.ts` |
| `/maqraah configuration update` | Update maqraah configuration | `role:role:no`, `voicechannel:channel:no`, `maqraah-time:string:no`, `pre-reminder-enabled:boolean:no`, `pre-reminder-minutes:integer:no`, `maqraah-reminder-enabled:boolean:no`, `maqraah-time-sync-enabled:boolean:no`, `maqraah-time-sync-prayer:string:no`, `maqraah-minutes-after-prayer:integer:no` | No command permission enforced | Guild | `src/features/maqraah/command.ts`, `src/features/maqraah/configurationCommand.ts` |
| `/maqraah configuration show` | Display current maqraah configuration | none | No command permission enforced | Guild | `src/features/maqraah/command.ts`, `src/features/maqraah/configurationCommand.ts` |
| `/change-upcoming-maqraah-time` | Change the next maqraah reminder time once | `time:string:yes` | No command permission enforced | Guild | `src/features/maqraah/reminders/changeUpcomingMaqraahTimeCommand.ts` |
| `/notes create` | Add a pending note | `text:string:yes` | No command permission enforced | Guild | `src/features/notes/command.ts` |
| `/notes create-annyomous` | Add an anonymous pending note | `text:string:yes` | No command permission enforced | Guild | `src/features/notes/command.ts` |
| `/notes show-mine` | Show caller's pending notes | none | No command permission enforced | Guild | `src/features/notes/command.ts` |
| `/notes show-all` | Show all pending notes | none | No command permission enforced | Guild | `src/features/notes/command.ts` |
| `/notes search` | Search pending/history notes | `query:string:yes`, `user:user:no`, `status:string:no`, `start-date:string:no`, `end-date:string:no` | No command permission enforced | Guild | `src/features/notes/command.ts`, `src/features/notes/search.ts` |
| `/notes delete` | Delete notes by display number after confirmation | `numbers:string:yes` | No command permission enforced | Guild | `src/features/notes/command.ts`, `src/features/notes/deleteConfirmations.ts` |
| `/notes delete-mine` | Delete caller's pending notes after confirmation | none | No command permission enforced | Guild | `src/features/notes/command.ts`, `src/features/notes/deleteConfirmations.ts` |
| `/notes delete-all` | Delete all notes after confirmation | none | No command permission enforced | Guild | `src/features/notes/command.ts`, `src/features/notes/deleteConfirmations.ts` |
| `/notes carry-over-last-notes` | Move included notes back to pending | none | No command permission enforced | Guild | `src/features/notes/command.ts` |
| `/notes show-history` | Show notes for a date | `day:integer:yes`, `month:integer:yes`, `year:integer:yes` | No command permission enforced | Guild | `src/features/notes/command.ts` |
| `/schedule create-recurring` | Create recurring generic reminder | `name:string:yes`, `days:string:yes`, `time:string:yes`, `message:string:yes`, `people:string:yes` | No command permission enforced | Guild | `src/features/schedule/command.ts` |
| `/schedule create-one-time` | Create one-time generic reminder | `name:string:yes`, `date:string:yes`, `time:string:yes`, `message:string:yes`, `people:string:yes` | No command permission enforced | Guild | `src/features/schedule/command.ts` |
| `/schedule update` | Update existing generic reminder | `name:string:yes`, `new-name:string:no`, `days:string:no`, `date:string:no`, `time:string:no`, `message:string:no`, `people:string:no` | No command permission enforced | Guild | `src/features/schedule/command.ts` |
| `/schedule delete` | Delete generic reminder | `name:string:yes` | No command permission enforced | Guild | `src/features/schedule/command.ts` |
| `/schedule list` | List active generic reminders | none | No command permission enforced | Guild | `src/features/schedule/command.ts` |
| `/schedule show` | Show one generic reminder | `name:string:yes` | No command permission enforced | Guild | `src/features/schedule/command.ts` |
| `/setup guide` | Post setup instructions | none | No command permission enforced | Guild | `src/features/setup/command.ts` |

Current top-level app command slots used: 9 (`configuration`, `help`, `hifz`, `change-upcoming-hifz-time`, `maqraah`, `change-upcoming-maqraah-time`, `notes`, `schedule`, `setup`).

### Prefix Commands

| Prefix | Name | Aliases | Permissions | File |
| --- | --- | --- | --- | --- |
| none | none | none | none | none |

### Context Menus

| Name | Type (User/Message) | Permissions | File |
| --- | --- | --- | --- |
| none | none | none | none |

### Component Handlers

| customId Pattern | Regex? | Triggered By | Handler File |
| --- | --- | --- | --- |
| `reminder:joining-shortly:{sessionId}` | No, colon parser | Pre-reminder attendance button | `src/features/maqraah/reminders/interactions.ts` |
| `reminder:cannot-make-it:{sessionId}` | No, colon parser | Pre-reminder attendance button | `src/features/maqraah/reminders/interactions.ts` |
| `reminder:carry-over-notes:{sessionId}` | No, colon parser | Builder exists; no current production sender found | `src/features/maqraah/reminders/interactions.ts` |
| `hifz-reminder:joining-shortly:{sessionId}` | No, colon parser | Hifz pre-reminder attendance button | `src/features/hifz/reminders/interactions.ts` |
| `hifz-reminder:cannot-make-it:{sessionId}` | No, colon parser | Hifz pre-reminder attendance button | `src/features/hifz/reminders/interactions.ts` |
| `hifz-reminder:previous-quran-page:{sessionId}:{page}` | No, colon parser | Hifz memorization page nav button | `src/features/hifz/reminders/interactions.ts` |
| `hifz-reminder:next-quran-page:{sessionId}:{page}` | No, colon parser | Hifz memorization page nav button | `src/features/hifz/reminders/interactions.ts` |
| `destructive-confirmation:confirm:{confirmationId}` | No, colon parser | Notes delete confirmations | `src/shared/confirmations/interactions.ts` |
| `destructive-confirmation:cancel:{confirmationId}` | No, colon parser | Notes delete confirmations | `src/shared/confirmations/interactions.ts` |

### Modals

| customId Pattern | Fields | Triggered By | Handler File |
| --- | --- | --- | --- |
| none | none | none | none |

### Autocomplete

| Command | Option | Data Source | Handler File |
| --- | --- | --- | --- |
| none | none | none | none |

### Event Listeners

| Event Name | What It Does (one line) | Critical Path? | File |
| --- | --- | --- | --- |
| `clientReady` | Registers guild commands, starts cron jobs, sends first-run guide. | YES | `src/app/bot.ts` |
| `interactionCreate` | Routes buttons and slash commands to handlers. | YES | `src/app/bot.ts`, `src/app/interactionRouter.ts` |
| `guildCreate` | Updates singleton configuration role to the new guild's everyone role. | NO | `src/app/bot.ts` |

## 6. Permissions & Security

Required bot permissions:

| Permission | Required By | Scope (guild/channel) |
| --- | --- | --- |
| View Channels | First-run guide, reminders, schedule notifications, progress dashboard validation | Reminder channel and configured voice channel |
| Send Messages | First-run guide, maqraah reminders, attendance announcements, generic schedule notifications | Reminder channel |
| Use Application Commands | All slash commands | Guild |
| Manage Channels | Optional voice channel rename when Maqraah time changes | Configured voice channel |

- Owner-only commands: none.
- Owner verification: none.
- Staff/admin role enforcement: none. No hardcoded staff IDs and no DB-driven staff roles are enforced.
- Global vs guild-locked commands: all commands are registered to the guild identified by `GUILD_ID` using `guild.commands.set()` at startup. There is no global command registration script.
- Permission validation flow: no central middleware. Runtime checks exist for setup guide sending, progress dashboard warnings, and voice channel rename permission. Command authorization is not enforced before handlers run.
- Token security: `DISCORD_TOKEN` is read from process env after `dotenv/config`; `.env` is ignored by git. Deployment writes `.env` from GitHub Secrets.
- Input validation: time, timezone, date, weekday, latitude/longitude, note delete positions, progress ranges, and mention strings are validated in handlers. SQLite queries use parameter binding for user input. No shell calls use user input.
- Mentions: generic schedules parse only user/role mentions and send with explicit `allowedMentions`; maqraah role mentions use the configured role ID.

## 7. Data Model

ORM: none. Repositories use raw `sqlite3` queries with callbacks wrapped in promises. Migration tool: ordered TypeScript migration files in `src/storage/sqlite/migrations/` with a transactional runner. Schema changes are applied automatically at startup; there is no separate `db:migrate` command. Backup strategy: not documented. Notes are hard-deleted when deleted; included notes are retained by status. One-time schedules are soft-completed with `status = 'completed'`.

### `configuration`

Purpose: singleton bot/guild configuration row (`id = 1`). Write frequency: rare, via `/configuration update`, `guildCreate`, first-run guide, and Maqraah time sync.

| Column | Type | Nullable | Default | Index |
| --- | --- | --- | --- | --- |
| `id` | INTEGER PRIMARY KEY | no | `1` inserted | PK |
| `roleId` | TEXT | yes | `Not set` | none |
| `dailyTime` | TEXT | yes | `12:00 PM` | none |
| `timezone` | TEXT | yes | `Africa/Cairo` | none |
| `voiceChannelId` | TEXT | yes | empty string | none |
| `preReminderEnabled` | INTEGER | yes | `1` | none |
| `preReminderOffsetMinutes` | INTEGER | yes | `5` | none |
| `mainReminderEnabled` | INTEGER | yes | `1` | none |
| `maqraahTimeSyncEnabled` | INTEGER | yes | `0` | none |
| `maqraahTimeSyncOffsetMinutes` | INTEGER | yes | `40` in schema | none |
| `maqraahTimeSyncLatitude` | REAL | yes | `30.0444` | none |
| `maqraahTimeSyncLongitude` | REAL | yes | `31.2357` | none |
| `maqraahTimeSyncCalculationMethod` | INTEGER | yes | `5` | none |
| `welcomeSentAt` | TEXT | yes | null | none |
| `hifzTime` | TEXT | yes | `6:00 PM` | none |
| `hifzReminderEnabled` | INTEGER | yes | `1` | none |
| `hifzPreReminderEnabled` | INTEGER | yes | `1` | none |
| `hifzPreReminderOffsetMinutes` | INTEGER | yes | `5` | none |
| `hifzEnabled` | INTEGER | yes | `1` | none |
| `hifzRoleId` | TEXT | yes | `Not set` (seeded from `roleId` on migrate) | none |
| `hifzTimeSyncEnabled` | INTEGER | yes | `1` | none |
| `hifzTimeSyncPrayer` | TEXT | yes | `dhuhr` | none |
| `hifzTimeSyncOffsetMinutes` | INTEGER | yes | `90` | none |
| hifzWeekdays | TEXT | yes | '' | none |
| `maqraahTimeSyncPrayer` | TEXT | yes | `maghrib` | none |

Example record: `{ id: 1, roleId: "123", dailyTime: "9:05 PM", timezone: "Africa/Cairo", voiceChannelId: "456", preReminderEnabled: 1, preReminderOffsetMinutes: 5, mainReminderEnabled: 1, maqraahTimeSyncEnabled: 0, maqraahTimeSyncPrayer: "maghrib", welcomeSentAt: "2026-04-20T18:00:00.000Z", hifzEnabled: 1, hifzRoleId: "123", hifzTime: "1:30 PM", hifzReminderEnabled: 1, hifzPreReminderEnabled: 1, hifzPreReminderOffsetMinutes: 5, hifzTimeSyncEnabled: 1, hifzTimeSyncPrayer: "dhuhr", hifzTimeSyncOffsetMinutes: 90 }`.
| hifzWeekdays | TEXT | yes | '' | none |

Guild settings and defaults are exactly the fields above. The current schema is singleton and does not support per-guild rows despite `GUILD_ID` being configurable.

### `progress`

Purpose: singleton shared reading progress row. Write frequency: per `/maqraah progress update`.

| Column | Type | Nullable | Default | Index |
| --- | --- | --- | --- | --- |
| `id` | INTEGER PRIMARY KEY | no | `1` inserted | PK |
| `currentPage` | INTEGER | yes | `1` | none |
| `currentHadith` | INTEGER | yes | `1` | none |

Example record: `{ id: 1, currentPage: 43, currentHadith: 13 }`.

### `hifz_progress`

Purpose: singleton shared memorization progress row, independent of maqraah reading progress. Write frequency: per `/hifz progress update` and the hifz page navigation buttons.

| Column | Type | Nullable | Default | Index |
| --- | --- | --- | --- | --- |
| `id` | INTEGER PRIMARY KEY | no | `1` inserted | PK |
| `currentPage` | INTEGER | yes | `1` | none |

Example record: `{ id: 1, currentPage: 7 }`.

### `notes`

Purpose: pending and included notes for upcoming or past maqraah reminders. Write frequency: per notes command and main reminder send.

| Column | Type | Nullable | Default | Index |
| --- | --- | --- | --- | --- |
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | no | auto | PK |
| `userId` | TEXT | no | none | none |
| `note` | TEXT | no | none | none |
| `dateAdded` | TEXT | no | none | none |
| `status` | TEXT | yes | `pending` | none |
| `lastIncludedDate` | TEXT | yes | null | none |
| `lastIncludedSessionId` | TEXT | yes | null | none |
| `isAnonymous` | INTEGER | yes | `0` | none |

Example record: `{ id: 7, userId: "111", note: "Review tajweed point", dateAdded: "2026-04-20T18:00:00.000Z", status: "pending", isAnonymous: 0 }`.

### `attendance`

Purpose: per-session attendance choices from preregistration commands or buttons. Write frequency: per attendance interaction.

| Column | Type | Nullable | Default | Index |
| --- | --- | --- | --- | --- |
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | no | auto | PK |
| `sessionId` | TEXT | no | none | unique with `userId` |
| `userId` | TEXT | no | none | unique with `sessionId` |
| `status` | TEXT | no | none | none |
| `updatedAt` | TEXT | no | none | none |
| `announcedAt` | TEXT | yes | null | none |

Example record: `{ id: 3, sessionId: "2026-04-20", userId: "111", status: "late", updatedAt: "2026-04-20T18:00:00.000Z", announcedAt: null }`. The `sessionId` is `YYYY-MM-DD` for maqraah and `hifz-YYYY-MM-DD` for hifz, so the two features share the table without conflict.

### `reminder_events`

Purpose: idempotency ledger for pre/main reminder sends per session. Write frequency: per scheduled reminder stage.

| Column | Type | Nullable | Default | Index |
| --- | --- | --- | --- | --- |
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | no | auto | PK |
| `sessionId` | TEXT | no | none | unique with `stage` |
| `stage` | TEXT | no | none | unique with `sessionId` |
| `scheduledFor` | TEXT | no | none | none |
| `sentAt` | TEXT | no | none | none |

Example record: `{ id: 10, sessionId: "2026-04-20", stage: "main", scheduledFor: "2026-04-20T19:00:00.000Z", sentAt: "2026-04-20T19:00:01.000Z" }`. The `sessionId` is `YYYY-MM-DD` for maqraah and `hifz-YYYY-MM-DD` for hifz, so both features' `pre`/`main` stages coexist in this shared table.

### `schedules`

Purpose: generic recurring and one-time reminders. Write frequency: per `/schedule` command and per schedule firing.

| Column | Type | Nullable | Default | Index |
| --- | --- | --- | --- | --- |
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | no | auto | PK |
| `name` | TEXT | no | none | none |
| `nameKey` | TEXT | no | none | UNIQUE |
| `type` | TEXT | no | none | none |
| `weekdays` | TEXT | yes | null | none |
| `oneTimeDate` | TEXT | yes | null | none |
| `time` | TEXT | no | none | none |
| `message` | TEXT | no | none | none |
| `mentionUserIds` | TEXT | no | empty string | none |
| `status` | TEXT | yes | `active` | `idx_schedules_status` |
| `creatorUserId` | TEXT | no | none | none |
| `createdAt` | TEXT | no | none | none |
| `updatedAt` | TEXT | no | none | none |
| `lastRunAt` | TEXT | yes | null | none |

Example record: `{ id: 4, name: "Monday prep", nameKey: "monday prep", type: "recurring", weekdays: "1", time: "7:30 PM", message: "Prepare notes", mentionUserIds: "user:111,role:222", status: "active" }`.

### `migrations`

Purpose: idempotency ledger tracking which schema migrations have been applied. Write frequency: per migration at startup.

| Column | Type | Nullable | Default | Index |
| --- | --- | --- | --- | --- |
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | no | auto | PK |
| `name` | TEXT | no | none | UNIQUE |
| `appliedAt` | TEXT | no | none | none |

Example record: `{ id: 1, name: "001_initial_schema", appliedAt: "2026-05-29T12:00:00.000Z" }`.

### `fasting_cycle_state`

Purpose: tracks the last fasted date for the dawood alternate-day fasting pattern. Write frequency: per dawood reminder sent.

| Column | Type | Nullable | Default | Index |
| --- | --- | --- | --- | --- |
| `cycleKey` | TEXT PRIMARY KEY | no | none | PK |
| `lastFastedDate` | TEXT | yes | null | none |
| `updatedAt` | TEXT | yes | null | none |

Example record: `{ cycleKey: "dawwd-alternate", lastFastedDate: "2026-04-20", updatedAt: "2026-04-20T18:00:00.000Z" }`.

## 8. Rate Limits & Quotas

| Endpoint / Action | Limit | How Bot Handles It |
| --- | --- | --- |
| Slash command initial response | 3 seconds to ack | Commands usually reply directly; no central `deferReply()` pattern. Long DB/API paths risk timeout. |
| Button interactions | 3 seconds to ack | Attendance buttons call `deferUpdate()`; destructive confirmations call `update()` or ephemeral reply. |
| Message send | Discord route limits, commonly per-channel buckets | discord.js REST manager handles 429s. Bot sends sequentially; no custom queue. |
| REST global | Discord global REST bucket | discord.js handles global rate limit backoff. |
| Guild command registration | Guild command overwrite on startup | One `guild.commands.set()` call on `clientReady`. |
| Voice channel rename | Channel modification route limit | Only attempted on configured time changes; discord.js handles 429s. |
| Bulk delete | Not used | Notes are DB rows, not Discord message bulk deletes. |

External APIs:

| API | Limit | Handler |
| --- | --- | --- |
| AlAdhan timings API | No quota documented in repo | Hourly cron at minute 7 when enabled; errors are logged and retried by the next cron run. |
| New Relic ingest | Account dependent | Winston/New Relic integration; no custom quota guard. |

Discord's 100 app-command limit: currently 9 top-level guild command slots are used. No global app commands are registered by this repo.

## 9. Environment & Config

| Variable | Type | Required | Example Value | Used In |
| --- | --- | --- | --- | --- |
| `DISCORD_TOKEN` | string | YES | `MT...` | `src/app/bot.ts` login |
| `GUILD_ID` | string | YES | `1234567890` | guild command registration, voice channel lookup, logging |
| `CHANNEL_ID` | string | YES | `9876543210` | reminders, setup guide, schedule sends, progress checks |
| `DATABASE_PATH` | string | YES before storage import | `./maqraah.db` | `src/storage/sqlite/index.ts` |
| `NEW_RELIC_LICENSE_KEY` | string | optional | `...` | `newrelic.js` |

Local dev setup:

```bash
cp .env.example .env
npm install
npm run build
npm run dev
```

There are no `deploy:guild`, `deploy:global`, or `db:seed` scripts. Commands are registered to the configured guild automatically on `clientReady`; restart the bot after changing command definitions. Schema migrations run automatically at startup; there is no separate `db:migrate` command.

Config hierarchy:

1. Existing process environment wins.
2. `.env` is loaded by `dotenv/config` for local runs.
3. SQLite `configuration` table stores mutable bot settings.
4. SQL schema defaults and helper defaults fill unset or invalid fields.

## 10. Conventions

How to add a new slash command:

1. Create a command module under `src/features/{feature}/command.ts` for a feature root command, or `src/features/{feature}/.../{name}Command.ts` for an extra command.
2. Export named `data` and `execute`; do not use a default export.

```ts
import { MessageFlags, SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
	.setName('name')
	.setDescription('Description');

export async function execute(interaction: any): Promise<void> {
	await interaction.reply({ content: 'Done.', flags: MessageFlags.Ephemeral });
}
```

3. Keep input parsing and Discord replies in the command module; put reusable DB access in repositories and cross-feature pure helpers in `src/shared/`.
4. Add focused tests next to the feature, usually `src/features/{feature}/{name}.test.ts`.
5. Run `npm test`. The build step compiles the command to `dist/`; the runtime command loader scans compiled `.js` files.
6. Restart the bot in the target guild. `src/app/commandRegistry.ts` overwrites guild commands at startup.

How to add a new event listener:

1. Edit `registerLifecycleHandlers()` in `src/app/bot.ts`.
2. Add a direct `client.on(Events.SomeEvent, handler)` or `client.once(...)` registration.
3. Keep substantial logic in a feature/helper module and import it into `bot.ts`.
4. Document the event in section 5 and add tests around the handler logic if it is not trivial.

How to add a new database migration:

1. Create a migration file: `src/storage/sqlite/migrations/{NNN}_{descriptive_name}.ts`.
2. Export a `Migration` object with a unique `name` (matching the filename convention) and an `async up(db)` function.

```ts
import sqlite3 from 'sqlite3';
import type { Migration } from './types';

export const migration002: Migration = {
	name: '002_add_new_table',
	async up(db: sqlite3.Database): Promise<void> {
		await run(db, `CREATE TABLE IF NOT EXISTS new_table (...)`);
	},
};

function run(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<void> {
	return new Promise((resolve, reject) => {
		db.run(sql, params, (err) => (err ? reject(err) : resolve()));
	});
}
```

3. Register the migration by adding it to the `migrations` array in `src/storage/sqlite/migrations/runner.ts`.
4. Migrations run in array order, wrapped in a transaction. Each migration + its `migrations` row insert is atomic. On failure, the migration is rolled back and startup halts with a clear error.
5. Use `IF NOT EXISTS`, `IF NOT NULL` guards, and `INSERT OR IGNORE` to keep migrations idempotent for existing databases.
6. Add a test in `src/storage/sqlite/migrations/runner.test.ts` or a colocated test file.
7. Document the new table/column in the Data Model section (section 7) of `AGENTS.md` and `README.md`.

Error handling pattern:

- `src/app/interactionRouter.ts` wraps command execution in try/catch, records New Relic attributes, logs failures, and sends a generic ephemeral error.
- Most feature commands also wrap their own switch in try/catch and send user-facing errors.
- Use `interaction.replied`/`interaction.deferred` before adding new outer error paths; the current router always calls `reply()` on command failure.
- For operations likely to take more than 3 seconds, call `deferReply()` or `deferUpdate()` before DB/API work.
- Do not expose stack traces to users; log errors with `logger.error()`.

Embed and message style:

- There is no universal embed-only rule. Current commands mix raw text replies and embeds.
- Common info color: `0x0099ff`; warning color in progress dashboard: `0xffcc00`.
- Ephemeral replies use either `flags: MessageFlags.Ephemeral` or `ephemeral: true`.
- Arabic user-facing reminder and attendance text is normal for maqraah flows.

Logging:

- Library: Winston through `src/observability/logging/logger.ts`, with New Relic instrumentation.
- Levels: `trace`, `debug`, `info`, `warn`, `error`, `fatal`.
- Preferred fields: Discord context (`discord.userId`, `discord.guildId`, `discord.channelId`, `discord.commandName`, `discord.subcommand`) and operation context (`operation.type`, `operation.status`, `operation.duration`, `custom.*`).
- Use the shared `logger` singleton, not `console.log`.

Naming conventions:

- Feature command files: `command.ts` for the main command, `*Command.ts` for extra commands discovered by the loader.
- Tests: colocated `*.test.ts` files under `src/`.
- Repository classes: `PascalCaseRepository.ts`.
- Shared helper functions: camelCase, verb-first when practical.
- Constants: existing code mostly uses lower camelCase exported objects with `as const`; match nearby style.
- Public slash command names must be lowercase and hyphenated.

## 11. Failure Modes & Recovery

| Failure | Symptom | Recovery |
| --- | --- | --- |
| `DISCORD_TOKEN` invalid or revoked | Login fails, bot offline, Discord 401/invalid token errors | Regenerate token in Discord Developer Portal, update secret/env, restart PM2. |
| `GUILD_ID` wrong | Bot logs guild not found; commands are not registered | Set correct guild ID, ensure bot is in guild, restart. |
| `CHANNEL_ID` wrong or uncached | Reminders/setup/schedules fail to send; warnings in logs | Set a sendable text channel ID and restart or rerun config paths. |
| `DATABASE_PATH` missing | Process throws during storage import | Set `DATABASE_PATH` before startup; create parent directory on server. |
| SQLite file locked/corrupt | Commands fail with DB errors | Stop duplicate processes, restore DB backup if available, restart. No automated backup exists. |
| Commands not responding | Discord shows interaction failed | Check gateway connection, PM2 logs, command registration, and long handlers lacking defers. |
| Interaction timeout over 3 seconds | User sees "The application did not respond" | Add `deferReply()` or `deferUpdate()` before slow work. |
| Discord rate limit hit | Delayed sends or 429s | discord.js normally backs off; reduce bursty reminder/note message sends if persistent. |
| AlAdhan API failure | Maqraah time sync does not update | Error is logged; hourly cron retries. Disable sync or fix location/timezone if repeated. |
| Cron process crash | No reminders fire | PM2 restart should bring process back; verify scheduled jobs in logs. |
| Missing `Manage Channels` | Voice channel name does not update | Grant `Manage Channels` on configured voice channel or disable voice channel feature. |
| New Relic misconfigured | Local log warnings or missing telemetry | Set `NEW_RELIC_LICENSE_KEY` or omit it for local/dev runs. |

On-call runbook reference: none found.

## 12. Observability

- Health check endpoint: none.
- Metrics exposed: no HTTP metrics endpoint. Logger records command, database, scheduler, reminder, and note events; New Relic can ingest logs/events when configured.
- Alerting: not documented.
- Log aggregation: New Relic when `NEW_RELIC_LICENSE_KEY` is set; otherwise stdout/PM2 logs.
- Tail logs locally: `npm run dev` for foreground logs, or `pm2 logs maqraah-bot` on the deployed server.
- Performance baseline: no measured P95 in repo. Target command response time should stay under 500ms for simple DB-backed commands and under Discord's 3-second ack limit for all interactions.

## 13. Build & Deploy

Build:

```bash
npm run build
```

Test:

```bash
npm test
```

Start compiled bot:

```bash
npm start
```

Register commands:

- Guild: automatic on startup via `src/app/commandRegistry.ts` and `GUILD_ID`.
- Global: not supported by current scripts.

Deploy procedure from `.github/workflows/deploy.yml`:

1. Push to `main` with non-markdown changes.
2. GitHub Actions checks out code and uses Node.js 22.
3. CI runs `npm ci` and `npm test`.
4. Deploy job rsyncs the repo to `/home/ubuntu/app`.
5. Deploy job prepares the SQLite database path from `DATABASE_PATH`.
6. Deploy job writes `.env` from GitHub Secrets/Variables.
7. Deploy job runs `npm install`.
8. Deploy job runs `npm run build`.
9. Deploy job runs `pm2 restart maqraah-bot || pm2 start dist/index.js --name maqraah-bot`.

Rollback: `git revert HEAD`, push to `main`, let the workflow redeploy. If the bad deploy changed SQLite schema/data, restore the database separately.

Command deregistration: remove or rename the command source, run `npm run build`, and restart the bot so `guild.commands.set()` overwrites the guild command set. There is no `commands:clear` script.

## 14. Testing

- Test runner: Node.js built-in test runner (`node --test`) against compiled `dist/**/*.test.js`.
- Run all tests: `npm test`.
- Run one compiled test file: `npm run build` then `node --test dist/features/notes/search.test.js`.
- Coverage report: no coverage script is configured.
- Coverage target: not documented.

What is mocked:

- Discord interactions, clients, channels, guilds, permissions, and repositories are hand-rolled in colocated tests.
- SQLite uses `process.env.DATABASE_PATH ??= ':memory:'` in many tests.
- External AlAdhan fetch behavior is tested through injectable fetch implementations in `prayerTimes` tests.

Manual staging:

- Test guild ID comes from `GUILD_ID`; no separate staging guild variable exists.
- Start with `npm run dev`, wait for command registration on `clientReady`, then test commands in the configured guild.

Naming:

- Tests are colocated and mirror source areas, for example `src/features/schedule/command.ts` and `src/features/schedule/command.test.ts`.

## 15. Known Issues & Tech Debt

- [HIGH] No command authorization middleware; any user can run configuration, progress updates, note delete-all, and schedule mutations - `src/features/configuration/command.ts:30`, `src/features/notes/command.ts:69`, `src/features/schedule/command.ts:37`.
- [HIGH] Data model is singleton, so multi-guild installs can overwrite shared configuration/progress despite `guildCreate` handling - `src/storage/sqlite/index.ts`, `src/app/bot.ts`.
- [MED] Router error path always calls `interaction.reply()` and can fail after a command has already replied or deferred - `src/app/interactionRouter.ts:76`.
- [MED] Long command paths do not consistently defer before DB/API work, creating interaction timeout risk - `src/app/interactionRouter.ts:54`.
- [LOW] Public subcommand typo `create-annyomous` is now part of the registered Discord surface - `src/features/notes/command.ts:17`.

## 16. Architecture Decision Records (ADR)

2026-04-20 | Use guild-scoped startup command registration | Commands update instantly in the configured guild and require no separate deploy script | Commands are unavailable outside `GUILD_ID` and startup overwrites the guild command set.

2026-04-20 | Use SQLite with repository singletons | Simple single-process persistence with no database service to operate | Current singleton schema is not multi-guild safe.

2026-05-29 | Ordered TypeScript migration files with transactional runner | Migrations are idempotent, version-controlled, and run automatically at startup in transactions; TypeScript functions allow logic beyond raw SQL | Migration failures halt startup; no rollback-to-version command exists.

2026-04-20 | Run schedulers in-process with node-cron | Minimal infrastructure for daily reminders, hourly time sync, and generic schedules | Process downtime means missed jobs; no distributed locking or queue.

2026-04-20 | Discover commands from compiled `dist/features` | Runtime loads CommonJS output consistently after `npm run build` | New commands are invisible until built, and source paths differ from runtime paths.

2026-04-20 | Keep only the `Guilds` intent | Current slash command, guild, channel, and role features do not need privileged gateway data | Features needing message content, member lists, or presence will require intent review.
