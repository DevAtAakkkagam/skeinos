## Context

The UI is Preact mounted in a shadow-DOM overlay (D3). Strings are already centralized in
per-module `strings.ts` `STR` objects and a few inline literals, but every value is English and
plural/count logic lives in ad-hoc `(n: number) => string` functions. There is no locale
resolution, no catalogs, and no expansion testing. DEV_GUARDRAILS [PREACT-7] and D21 anticipate
this change: externalize once, then DE/FR/ES/PT and a pseudo-loc pass become catalog work, not
component surgery.

Constraints: MV3 service worker can die at any time, but i18n is a **UI-only concern** — the
worker stores and returns locale-neutral data (ids, counts, ISO timestamps); all formatting
happens in the view. Bundle budgets are enforced (`check:size`), so the runtime must be light.
No new permissions, no network, nothing leaves the device ([PRIV-1]).

## Goals / Non-Goals

**Goals:**
- One resolver that picks the active locale from the browser and falls back to English per-key.
- A typed catalog format with named-parameter interpolation and plural selection.
- All `src/ui/**` + `src/shared/**` user-facing strings read through `t()`; English catalog is the
  single source of truth.
- Full DE/FR/ES/PT catalogs + a dev/test pseudo-locale that pads ~40% and brackets each string.
- CI guards: no hard-coded user-facing strings in `src/ui`; every locale complete vs. English.
- Locale-aware number/date/relative-time via `Intl`.

**Non-Goals:**
- A Settings UI to override the browser locale (English fallback + browser detection only this change).
- Translating the service worker, logs, error stacks, or developer-facing strings.
- RTL layout support (no RTL locale in scope; revisit if Arabic/Hebrew is ever added).
- Translating dynamic user content (prompt bodies, conversation titles) — content is never translated.
- Server-driven catalogs / over-the-air locale updates.

## Decisions

### D-i18n-1: Small in-repo runtime, not an ICU library
Use a ~100-line in-repo formatter (named `{param}` substitution + a `count`-driven plural branch
using `Intl.PluralRules`) instead of `i18next`/`@formatjs/intl`. Catalogs are plain typed TS
modules (`Record<MessageKey, string | PluralForms>`), tree-shaken and statically importable.
*Why:* protects the bundle budget and keeps the shadow-DOM bundle dependency-free; our message set
is modest and doesn't need full ICU MessageFormat. *Alternative considered:* `@wxt-dev/i18n` /
`chrome.i18n` with `_locales/messages.json` — rejected because `chrome.i18n` locks to the browser
UI language with **no runtime switch** (blocks the pseudo-locale + future override) and its
`messages.json` placeholders are clumsier than typed interpolation.

### D-i18n-2: Locale resolution order
`resolveLocale()` = first supported match of: pseudo-loc override (dev/test flag) →
`browser.i18n.getUILanguage()` → `navigator.languages[]` → `'en'`. Match by primary subtag
(`de-AT` → `de`); unmatched → `'en'`. Resolved once at UI mount and frozen for the session
(re-resolving mid-session is unnecessary; browser locale doesn't change live).

### D-i18n-3: Catalog shape & typing
English catalog (`locales/en.ts`) defines the `MessageKey` union (via `keyof typeof en`); every
other locale is typed `Catalog = Record<MessageKey, ...>` so a missing/renamed key is a **compile
error**, and a separate runtime/test completeness check covers orphan keys. Keys are namespaced by
surface (`prompts.newPrompt`, `sidebar.empty.title`) mirroring today's `strings.ts` grouping to
keep the refactor mechanical.

### D-i18n-4: Per-key fallback to English
`t(key, params)` reads the active catalog; if the key is absent or empty it falls back to the
English value (never renders the raw key or empty string in production). Pseudo-loc is the only
locale intentionally allowed to be generated rather than authored.

### D-i18n-5: Plurals via `Intl.PluralRules`
Count-bearing messages become `{ one: '…', other: '…' }` (CLDR categories per locale) selected by
`Intl.PluralRules(locale).select(n)`, replacing `varsCount`-style functions. Numbers/dates format
via `Intl.NumberFormat`/`Intl.DateTimeFormat`; `relativeTime.ts` moves to `Intl.RelativeTimeFormat`.

### D-i18n-6: Pseudo-locale generator
`en-XA` is derived from `en` at build/runtime by a transformer: map ASCII letters to accented
equivalents, wrap in `⟦…⟧`, and pad to ~140% length, **without** touching `{param}` placeholders.
Used in a Playwright/browser test asserting no clipped/overflowing nodes (D21 ~30% tolerance).

### D-i18n-7: Lint guard for hard-coded strings
An ESLint rule (`react/jsx-no-literals`-style, scoped to `src/ui/**`, allow-listing punctuation/
non-letter literals and `aria` plumbing where appropriate) fails the build on bare user-facing
text. Enforces [PREACT-7] for all future components, not just this pass.

## Risks / Trade-offs

- **[Translation quality]** Machine/seed translations may read awkwardly. → English is the always-safe
  fallback; catalogs are plain TS so native-speaker fixes are one-line PRs; pseudo-loc protects
  *layout* regardless of wording.
- **[Layout breakage on expansion]** DE/pseudo-loc can overflow nav, chips, badges. → Pseudo-loc
  browser test in CI; fix via flexible/truncating tokens in styles, not by shortening copy.
- **[Lint false positives]** The literal-string rule may flag legitimate non-text literals. →
  Scope to `src/ui/**`, allow-list non-letter strings and known props; document escape hatch.
- **[Bundle growth]** Five catalogs add weight. → Catalogs are tree-shakeable static modules and
  text-only; verify against `check:size`; lazy-load non-English catalogs if a budget threatens.
- **[Intl availability]** Relies on `Intl.*` in the extension runtime. → Chromium/Firefox MV3 ship
  full ICU `Intl`; no polyfill needed.

## Migration Plan

1. Land `core/i18n` + `locales/en.ts` (English extracted verbatim from current `STR`/literals) with
   `t()` returning identical output — behavior-neutral.
2. Refactor each UI surface to `t()`, deleting its `strings.ts`; tests updated to assert via keys
   or visible English (unchanged copy keeps snapshots stable).
3. Add DE, then FR/ES/PT catalogs; add pseudo-loc + completeness + lint guards to CI.
4. Rollback: the English catalog alone is a complete, behavior-equivalent system; non-English
   catalogs and guards can be reverted independently without affecting English users.

## Open Questions

- Exact pseudo-loc padding ratio (140% vs 160%) — pick the strictest that current layouts pass.
- Whether `relativeTime` switches fully to `Intl.RelativeTimeFormat` now or keeps the existing
  thresholds with localized unit strings (lean: use `Intl.RelativeTimeFormat`).
