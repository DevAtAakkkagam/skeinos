## Why

Every user-facing string today is an English literal — centralized in per-module `strings.ts`
`STR` objects and inline JSX, but never routed through a real translation layer. The
DEV_GUARDRAILS [PREACT-7] promise ("route copy through the i18n layer so the German pass and
~30% expansion tolerance don't require touching every component") is unfulfilled: there is no
layer, no catalogs, and no way to render the UI in the user's browser language. C33 builds the
framework, externalizes the strings, ships DE/FR/ES/PT, and adds a pseudo-locale so layout
expansion is caught in CI rather than by translators.

## What Changes

- Add a runtime i18n layer (`core/i18n` + a Preact `useT()` hook / `t()` accessor) that resolves
  the active locale from the **browser locale** (`browser.i18n.getUILanguage()` / `navigator.language`),
  maps it to the nearest supported catalog, and **falls back to English** key-by-key for any
  missing translation.
- Define a typed message-catalog format with **named-parameter interpolation** and plural
  selection (replacing the ad-hoc `(n: number) => string` functions in today's `STR` objects),
  so a translator owns each whole phrase.
- **Externalize all existing user-facing strings** from `src/ui/**` and `src/shared/**` into the
  English catalog as the source of truth; refactor components to read via `t()` instead of `STR`/literals.
- Ship **German (DE), French (FR), Spanish (ES), Portuguese (PT)** translations for the full catalog.
- Add a **pseudo-locale** (`en-XA`-style: accented + ~40% padded + bracketed) selectable for
  development/test to surface truncation and expansion bugs (D21: ~30% tolerance).
- Add a **lint guard** that fails on hard-coded user-facing string literals in `src/ui/**`
  (enforces [PREACT-7] going forward).
- Add a **catalog-completeness check** (every locale has every English key; no orphan keys) wired
  into the test suite.
- Locale resolution is read-only against the browser today; an explicit user override in Settings
  is **out of scope** for this change (English fallback + browser locale only).

## Capabilities

### New Capabilities
- `i18n`: locale resolution from the browser with English fallback, the typed message-catalog
  format (interpolation + plurals), the supported-locale set (en, de, fr, es, pt + pseudo), the
  pseudo-locale expansion pass, and the no-hard-coded-strings / catalog-completeness guards.

### Modified Capabilities
<!-- None: existing capabilities' spec-level behavior is unchanged. String externalization is an
     implementation refactor of UI capabilities, and PREACT-7 already mandates externalization. -->

## Impact

- **New code:** `extension/src/core/i18n/` (resolver, catalog types, `t()`/`useT()`, pseudo-loc
  transformer), `extension/src/locales/{en,de,fr,es,pt}.ts` catalogs.
- **Refactored code:** all `src/ui/**` components and `src/ui/**/strings.ts` files (see git: prompts,
  profiles, input-bar, sidebar, search, tags, onboarding, options, components) + `src/shared/branding.ts`.
  `relativeTime.ts` formatting routes through locale-aware `Intl`.
- **Build/CI:** new ESLint rule (no literal JSX text / no bare user-facing strings in `src/ui`),
  new catalog-completeness test; both join `npm test` / lint gates.
- **Permissions/privacy:** none — locale detection uses the existing `browser.i18n` API and
  `navigator.language`; no new host permissions, no network, no data leaves the device ([PRIV-1] intact).
- **Dependencies:** prefer a zero/near-zero-dep approach (small in-repo formatter) over a heavy ICU
  runtime to protect the bundle budget; final choice recorded in design.md.
