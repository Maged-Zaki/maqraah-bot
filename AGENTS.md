# Agent Guide

Read this first when adding or changing behavior. The repo is organized around public Discord command namespaces, so an agent can usually work inside one command feature folder plus one supporting adapter, without scanning the whole tree.

## Source Map

- `src/app/` is the bot shell: Discord client startup, command registration, interaction routing, and welcome-message wiring.
- `src/features/` is the main place to work. Top-level folders should match public command namespaces such as `maqraah`, `notes`, `configuration`, `setup`, and `help`.
- `src/features/maqraah/` owns the `/maqraah` command namespace and maqraah-specific behavior.
- `src/features/maqraah/progress/` owns `/maqraah progress ...` dashboard/update logic. `src/features/maqraah/progressAliasCommand.ts` keeps the legacy `/progress ...` alias registered without creating a separate progress feature.
- `src/features/maqraah/reminders/` owns reminder scheduling, reminder messages, reminder buttons, attendance preregistration support, voice-channel time display, and Maghrib time sync.
- `src/storage/sqlite/` owns SQLite setup, schema creation, and repository instances. Repository classes live in `src/storage/sqlite/repositories/`.
- `src/observability/logging/` owns the shared logger and New Relic log enrichment.
- `src/shared/` contains small pure helpers used by more than one feature.
- `plans/` contains feature briefs and backlog notes. Treat plans as guidance, then verify paths against the current source map.

## Feature Playbook

1. Start in `src/features/<command-name>/` if the change affects a Discord command, response text, button, modal, reminder flow, or schedule. For `/maqraah ...`, start in `src/features/maqraah/`.
2. Add a new top-level feature folder only for a new public command namespace. If the behavior belongs under an existing command, add a subfolder there instead.
3. Slash commands must live in a file named `command.ts` or `*Command.ts` and export both `data` and `execute(interaction)`.
4. Command aliases may live beside the owning command namespace as `*AliasCommand.ts` or another explicit `*Command.ts` file. Keep the alias thin and delegate to the owning handler.
5. Keep feature-specific builders near the feature: message text in `messages.ts`, Discord components in `components.ts`, button or modal handling in `interactions.ts`, and scheduling in `scheduler.ts`.
6. Put persistence in `src/storage/sqlite/`: add table setup in `index.ts`, add or extend a repository in `repositories/`, then export the singleton from `index.ts`.
7. Put only cross-feature, dependency-light helpers in `src/shared/`. If one command namespace is the only caller, keep the helper inside that feature.
8. Put tests next to the owning code as `*.test.ts`.

## Where To Look

- Command discovery and registration: `src/app/commandRegistry.ts`
- Global Discord interaction routing: `src/app/interactionRouter.ts`
- Bot startup and lifecycle wiring: `src/app/bot.ts`
- Maqraah command and attendance routing: `src/features/maqraah/command.ts`
- Maqraah progress dashboard/update logic: `src/features/maqraah/progress/handler.ts`
- Maqraah progress dashboard display: `src/features/maqraah/progress/dashboard.ts`
- Legacy `/progress` alias command: `src/features/maqraah/progressAliasCommand.ts`
- Reminder scheduling and reminder sends: `src/features/maqraah/reminders/scheduler.ts`
- Maqraah time sync from Maghrib: `src/features/maqraah/reminders/maqraahTimeSync.ts`
- Database schema and repository singletons: `src/storage/sqlite/index.ts`
- Structured logging: `src/observability/logging/logger.ts`

## Boundaries

- Do not create a new `src/infrastructure/` folder. Use the explicit folders above.
- Do not add command files under `src/commands/`; command discovery is feature-first.
- Do not create a top-level `src/features/progress/` folder for maqraah reading progress. Progress belongs under `src/features/maqraah/progress/`; keep `/progress` only as a thin alias command if compatibility is still needed.
- Keep `src/app/` feature-agnostic. It can route to a feature, but feature decisions should stay in `src/features/`.
- Keep repositories focused on storage access. User-facing behavior belongs in feature files.
- Prefer extending an existing feature folder over adding a new top-level category.

## Verification

- Run `npm run build` after source moves, import changes, or TypeScript edits.
- Run `npm test` when changing scheduling, database repositories, command behavior, or shared helpers.
- The build output in `dist/` is generated; do not edit it directly.
