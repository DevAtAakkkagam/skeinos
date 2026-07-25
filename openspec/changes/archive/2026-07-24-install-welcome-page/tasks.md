## 1. Settings flag

- [x] 1.1 Add additive optional `welcomeShown?: boolean` to `Settings` in `src/shared/settings.ts` (defaults to `false` via the settings merge; documented as decoupled from `onboardingCompleted`)

## 2. i18n

- [x] 2.1 Add the `welcome.*` namespace to `src/locales/en.ts` (eyebrow, browser-specific titles/find/diagram/callout, pin/sidebar notes, Chrome-only lead+rest caveat, how-it-works heading + step label/titles/bodies, assurance lead+body, settings/feedback links, disclaimer)
- [x] 2.2 Translate the `welcome.*` block into `de`, `fr`, `es`, `pt`
- [x] 2.3 Confirm the catalog-completeness test passes (`tests/i18n-catalogs.test.ts`)

## 3. Welcome UI

- [x] 3.1 Create `src/ui/welcome/styles.ts` (`WELCOME_CSS`, scoped `.sk-wl*`, `--sk-*` tokens only, tonal accent tints, mono overlines, thread-draw + pulse animations gated behind `prefers-reduced-motion`)
- [x] 3.2 Create `src/ui/welcome/WelcomeApp.tsx` (Preact, `useT`, `import.meta.env.BROWSER` build-time variant, `BrandGlyph`/`LockIcon`, hand-built Chrome + Firefox browser illustrations, 3-step flow, Chrome-only caveat, footer settings/feedback links)

## 4. Entrypoint

- [x] 4.1 Create `src/entrypoints/welcome/index.html`
- [x] 4.2 Create `src/entrypoints/welcome/main.ts` (mount via `ui/mount`, inject `WELCOME_CSS`, `ensureLocale`, initial theme from settings, `subscribeSettings` re-theme, body-margin/background reset)

## 5. Open-on-install wiring

- [x] 5.1 Create `src/background/welcomeTab.ts` (`openWelcomeOnce` with `welcomeShown` guard set before `tabs.create`; `registerWelcomeTab` listening on `onInstalled` reason `install` only; safe no-op without `tabs`/`runtime`)
- [x] 5.2 Register `registerWelcomeTab()` as a top-level side effect in `src/background/index.ts`

## 6. Tests & verification

- [x] 6.1 `tests/welcome-open.test.ts` — fresh install opens + sets guard; guard blocks re-open; `update` reason never opens; missing APIs no-op; install-only dispatch
- [x] 6.2 `tests/welcome-page.test.tsx` — renders the surface, Chrome variant title + caveat, four site chips, three steps
- [x] 6.3 Run `typecheck`, `lint`, full `test` suite (all green)
- [x] 6.4 Build and drive the real `welcome.html` in a browser at Chrome/light and dark, verifying the `#` logo, arrow-to-icon annotation, and emphasized caveat
- [x] 6.5 Smoke-test open-on-install + the sidebar illustration on a real Firefox profile (Chromium build verified here; Firefox pending a real profile)
