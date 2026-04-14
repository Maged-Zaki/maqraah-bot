# Source Map

This source tree is organized by intent first, then technical layer. When adding or changing behavior, start in the feature folder that owns the user-facing flow.

## App

`app/` owns Discord client startup and cross-feature routing.

- `bot.ts` creates the client, registers lifecycle handlers, schedules reminders, and starts login.
- `commandRegistry.ts` discovers slash commands from `features/**/command.ts` and `features/**/*Command.ts`.
- `interactionRouter.ts` routes Discord interactions to slash commands, buttons, and modals.
- `welcomeMessage.ts` sends the startup welcome message.

## Features

`features/` owns user-facing bot capabilities. Each feature keeps its commands, interactions, component builders, and schedulers close together.

- `features/configuration/` handles bot configuration commands.
- `features/help/` handles help output.
- `features/notes/` handles note commands.
- `features/progress/` handles progress commands.
- `features/reminders/` handles reminder scheduling, reminder buttons, modals, and reminder-specific commands.

## Infrastructure

`infrastructure/` owns integrations and persistence details that features call into.

- `infrastructure/database/index.ts` initializes SQLite and exports repository instances.
- `infrastructure/database/repositories/` contains focused repository classes.
- `infrastructure/logging/logger.ts` contains the shared structured logger.

## Shared

`shared/` contains small domain helpers that are useful across features but do not own external integrations.

- `shared/content/` contains Discord/content formatting helpers such as chunking long text.
- `shared/quran/` contains Quran-specific helpers such as page wrapping.

## Command Discovery

Slash commands are loaded recursively from compiled files under `dist/features/`.

Use one of these names for command modules:

- `command.ts`
- `*Command.ts`

Each command module must export:

- `data`
- `execute(interaction)`
