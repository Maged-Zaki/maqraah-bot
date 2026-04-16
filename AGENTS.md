# Agent Guide

Read this first when adding or changing behavior. The repo is organized so an agent can usually work inside one feature folder plus one supporting adapter, without scanning the whole tree.

## Source Map

- `src/app/` is the bot shell: Discord client startup, command registration, interaction routing, and welcome-message wiring.
- `src/features/` is the main place to work. Each folder owns one user-facing capability and keeps commands, messages, components, schedulers, and interactions together.
- `src/storage/sqlite/` owns SQLite setup, schema creation, and repository instances. Repository classes live in `src/storage/sqlite/repositories/`.
- `src/observability/logging/` owns the shared logger and New Relic log enrichment.
- `src/shared/` contains small pure helpers used by more than one feature.
- `plans/` contains feature briefs and backlog notes. Treat plans as guidance, then verify paths against the current source map.

## Feature Playbook

1. Start in `src/features/<feature>/` if the change affects a Discord command, reminder flow, response text, button, modal, or schedule.
2. Add a new feature as `src/features/<feature-name>/` when no existing folder clearly owns the behavior.
3. Slash commands must live in a file named `command.ts` or `*Command.ts` and export both `data` and `execute(interaction)`.
4. Keep feature-specific builders near the feature: message text in `messages.ts`, Discord components in `components.ts`, button or modal handling in `interactions.ts`, and scheduling in `scheduler.ts`.
5. Put persistence in `src/storage/sqlite/`: add table setup in `index.ts`, add or extend a repository in `repositories/`, then export the singleton from `index.ts`.
6. Put only cross-feature, dependency-light helpers in `src/shared/`. If one feature is the only caller, keep the helper inside that feature.
7. Put tests next to the owning code as `*.test.ts`.

## Where To Look

- Command discovery and registration: `src/app/commandRegistry.ts`
- Global Discord interaction routing: `src/app/interactionRouter.ts`
- Bot startup and lifecycle wiring: `src/app/bot.ts`
- Reminder scheduling and reminder sends: `src/features/reminders/scheduler.ts`
- Maqraah time sync from Maghrib: `src/features/reminders/maqraahTimeSync.ts`
- Database schema and repository singletons: `src/storage/sqlite/index.ts`
- Structured logging: `src/observability/logging/logger.ts`

## Boundaries

- Do not create a new `src/infrastructure/` folder. Use the explicit folders above.
- Do not add command files under `src/commands/`; command discovery is feature-first.
- Keep `src/app/` feature-agnostic. It can route to a feature, but feature decisions should stay in `src/features/`.
- Keep repositories focused on storage access. User-facing behavior belongs in feature files.
- Prefer extending an existing feature folder over adding a new top-level category.

## Verification

- Run `npm run build` after source moves, import changes, or TypeScript edits.
- Run `npm test` when changing scheduling, database repositories, command behavior, or shared helpers.
- The build output in `dist/` is generated; do not edit it directly.
