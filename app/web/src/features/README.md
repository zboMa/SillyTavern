# `src/features`

Feature modules (vertical slices): UI + state + domain logic.

Guidelines:
- Prefer "feature-first" structure: `features/<feature>/...`
- Cross-feature shared logic goes to `src/core` (or `src/ui` for shared components).
- Features must not touch legacy extension DOM mounts directly.

