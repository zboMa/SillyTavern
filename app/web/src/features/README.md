# `src/features`

Feature modules (vertical slices): UI + state + domain logic.

Guidelines:
- Prefer "feature-first" structure: `features/<feature>/...`
- Cross-feature shared logic goes to `src/core` (or `src/ui` for shared components).
- Features must not touch legacy extension DOM mounts directly.

Notes:
- `features/onboarding/WelcomePage.vue` mirrors the legacy first-run onboarding flow (persona name + UI language selector),
  driven by legacy `settings.firstRun` and persisted via `/api/settings/get` + `/api/settings/save`.
- Welcome page UI strings are localized via `vue-i18n` using the new dictionaries in `app/web/src/locales/`,
  not the legacy `public/locales/*`.

