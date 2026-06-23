## 1. i18n runtime (`core/i18n`)

- [x] 1.1 Add `core/i18n/locales.ts`: the supported-locale set (`en`, `de`, `fr`, `es`, `pt`, pseudo) and a `resolveLocale()` that matches `browser.i18n.getUILanguage()` → `navigator.languages` → `'en'` by primary subtag (D-i18n-2).
- [x] 1.2 Add `core/i18n/catalog.ts`: the `Catalog` type, `MessageKey` derived from the English catalog, and the `PluralForms` shape (D-i18n-3).
- [x] 1.3 Add `core/i18n/format.ts`: named-parameter interpolation + plural selection via `Intl.PluralRules`; no remaining `{param}` tokens after substitution (D-i18n-1, D-i18n-5).
- [x] 1.4 Add `core/i18n/index.ts`: `t(key, params)` with per-key English fallback (D-i18n-4) and a Preact `useT()` hook that resolves the locale once at mount and freezes it.
- [x] 1.5 Unit tests: resolution order, subtag mapping, unsupported→en, interpolation, plural per locale, English fallback for missing/empty keys.

## 2. English catalog (source of truth)

- [x] 2.1 Create `locales/en.ts` by extracting every string from the existing `src/ui/**/strings.ts` `STR` objects (prompts, profiles, input-bar) into namespaced keys mirroring their grouping.
- [x] 2.2 Extract inline user-facing literals from the remaining UI components (sidebar, search, tags, onboarding, options, components) and `src/shared/branding.ts` into `locales/en.ts`.
- [x] 2.3 Convert count/plural functions (e.g. `varsCount`) into `{ one, other }` plural entries.

## 3. Refactor UI to `t()`

- [x] 3.1 Refactor prompts, profiles, and input-bar surfaces to read via `t()`/`useT()`; delete their `strings.ts`.
- [x] 3.2 Refactor sidebar, search, tags, onboarding, options, and shared components to `t()`.
- [x] 3.3 Move `sidebar/relativeTime.ts` to locale-aware `Intl.RelativeTimeFormat`; route number/date formatting through `Intl` (D-i18n-5).
- [x] 3.4 Update existing component tests that assert on copy to query via keys or unchanged English; run `npm test` + `npm run typecheck` green.

## 4. Translations DE/FR/ES/PT

- [x] 4.1 Add `locales/de.ts` (full catalog, typed `Catalog`).
- [x] 4.2 Add `locales/fr.ts`, `locales/es.ts`, `locales/pt.ts` (full catalogs).
- [x] 4.3 Verify each locale renders end-to-end (locale-forced render test per locale).

## 5. Pseudo-locale + expansion pass

- [x] 5.1 Add `core/i18n/pseudo.ts`: derive the pseudo-locale from `en` (accent + bracket + ≥140% pad) leaving `{param}` tokens untouched (D-i18n-6).
- [x] 5.2 Add a dev/test flag to force the pseudo-locale via `resolveLocale()`.
- [x] 5.3 Add a browser test (`tests/browser`) rendering nav, segmented controls, chips, and badges in the pseudo-locale and asserting no clipping/overflow (D21).
- [x] 5.4 Fix any layout overflow surfaced, via flexible/truncating `--sk-*` style tokens (not by shortening copy).

## 6. Guards & CI

- [x] 6.1 Add the catalog-completeness test (every locale = English key set; no orphan keys).
- [x] 6.2 Add an ESLint rule scoped to `src/ui/**` that fails on hard-coded user-facing string literals; allow-list non-letter literals and known props ([PREACT-7]).
- [x] 6.3 Run `npm run lint`, `npm test`, `npm run test:browser`, and `npm run check:size`; confirm all green and bundle within budget.

## 7. Docs

- [x] 7.1 Note the i18n layer + "add a string via `t()`/catalog, never a literal" convention where contributors will find it (DEV_GUARDRAILS [PREACT-7] / CLAUDE.md pointer).
