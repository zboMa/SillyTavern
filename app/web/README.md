# `@sillytavern/web` (Vue 3 scaffold)

This is a **new** Vue 3 + Vite frontend scaffold for a **full frontend rewrite**.

## Goals

- Provide a modern Vue 3 app shell.
- Provide a Vue3-native **plugin/extension architecture**.
- Keep naming/style/ideas consistent with the original project, without attempting runtime compatibility.

## Architecture

Top-level structure:

- `src/core/`: framework-agnostic building blocks (event bus, utilities, etc.)
- `src/features/`: feature-first modules (UI + state + domain logic)
- `src/plugins/`: plugin system (registration, lifecycle, UI composition)

## Rewrite rules (important)

- **Single responsibility**: keep each module narrow (UI, state, domain logic separated).
- **Vertical slices**:
  - Rewrite one feature end-to-end (model → UI → integration) before starting another.
- **Plugin-first composition**:
  - Feature entry points are registered as plugins (built-in or optional).

## Commands (pnpm)

From repo root:

- `pnpm install`
- `pnpm web:dev`
- `pnpm web:build`
- `pnpm web:preview`

Or from `app/web`:

- `pnpm dev`
- `pnpm build`
- `pnpm preview`

## Notes

- This scaffold does **not** wire into the existing `public/` frontend yet.
- The plugin system in `src/plugins/` is the intended replacement for the old extension mechanism.
