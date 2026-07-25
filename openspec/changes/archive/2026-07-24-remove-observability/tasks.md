# Tasks — remove-observability

Ordered so the codebase stays compiling as much as possible; the final `typecheck`
is the completeness check for missed call sites (design D-1).

## 1. Delete the observability core + tests

- [x] 1.1 Delete `extension/src/core/observability/` in full (buffer, builder, chrome, client, config, egress, identity, index, scrubber, taxonomy, types, validator).
- [x] 1.2 Delete the six test files: `tests/observability-allowlist.test.ts`, `observability-egress.test.ts`, `observability-identity.test.ts`, `observability-onboarding.test.tsx`, `observability-scrubber.test.ts`, `observability-settings.test.ts`.

## 2. Unwire the worker + emit call sites

- [x] 2.1 `background/index.ts`: remove the `../core/observability` import block, the `registerTelemetryHandlers()` / `registerTelemetryFlush()` / `installExceptionCapture('service_worker')` calls, and the Observability comment block. Leave the LAST-installed `installMessageHub()` ordering intact.
- [x] 2.2 `content/index.ts`: remove the `installExceptionCapture, track` import and its three call sites (`installExceptionCapture('content')`, the `adapter_fallback_shown` track, the `adapter_signed_out` track).
- [x] 2.3 `adapters/resilience/report.ts`: remove the `recordEvent` import + both call sites (self-check-failed loop, `adapter_recovered`), remove the `ANCHOR_KEYS` / `AnchorKey` import and the `toAnchorKey` / `safeVer` helpers. Keep `registerResilienceHandlers`, `reportHealth`, `queryHealth`, and the health persistence + `platform.degraded` broadcast.
- [x] 2.4 In the same file, drop the now-dead `configVer` from the `platform.report-health` request contract and from `reportHealth(...)`; update every `reportHealth` caller to stop passing it. Confirm no other module reads `configVer`.

## 3. Remove the consent surface

- [x] 3.1 Delete `ui/components/ConsentToggle.tsx`.
- [x] 3.2 `ui/onboarding/OnboardingSurface.tsx`: remove the `ConsentToggle` import, `consent` state, `toggleConsent`, the `persistConsent` prop + default, the commit-on-finish `persistConsent(...)` call, and the rendered `<ConsentToggle>` in the final step. Verify `STEP_COUNT` and the step dots are unchanged.
- [x] 3.3 `ui/options/OptionsApp.tsx`: remove the `ConsentToggle` import, `toggleConsent`, and the rendered toggle. If the Privacy section is now empty, remove the section and its heading rather than leaving a bare header.
- [x] 3.4 `ui/styles.ts`: remove the `.sk-consent`, `.sk-consent__input`, `.sk-consent__text`, `.sk-consent__label`, `.sk-consent__body` rules.

## 4. Settings + i18n

- [x] 4.1 `shared/settings.ts`: remove the `diagnosticsOptIn` field from `Settings` and from `DEFAULT_SETTINGS` (and its doc comments). Leave the legacy `telemetry` boolean untouched (out of scope).
- [x] 4.2 Remove the `onboarding.consentHeading`, `onboarding.consentDiagnosticsLabel`, `onboarding.consentDiagnosticsBody`, `options.diagnosticsLabel`, and `options.diagnosticsBody` keys from all five locales: `en.ts`, `de.ts`, `es.ts`, `fr.ts`, `pt.ts`. Remove them in lockstep so the i18n completeness test passes.
- [x] 4.3 Fix the stray `diagnosticsOptIn: true` fixture in `tests/input-bar-profile-chip.test.tsx`.

## 5. Update onboarding/options tests

- [x] 5.1 Update `tests/onboarding-*` and any options/settings suites that assert the diagnostics toggle, its persistence, or the consent copy, so they reflect its removal (no telemetry opt-in rendered, `finish` no longer commits consent).

## 6. Docs, disclosure, decision log

- [x] 6.1 `website/privacy/index.html`: remove the PostHog EU diagnostics paragraph; replace with the positive claim that Skeinos makes no external network requests and no data leaves the device.
- [x] 6.2 `docs/PRIVACY.md`: same edit as 6.1.
- [x] 6.3 `docs/STORE_DATA_USE.md`: remove the diagnostics-telemetry / PostHog disclosure; state no data collection.
- [x] 6.4 `docs/DECISIONS.md`: add a new dated entry superseding **D29**, and annotate D29 as superseded (do not delete D29).
- [x] 6.5 Note for the maintainer (not a repo change): update the Chrome Web Store and Firefox AMO data-use dashboards to drop the diagnostics declaration so the published listing does not over-declare.

## 7. Verify

- [x] 7.1 `npm run typecheck` — passes with no dangling `observability` / `telemetry.emit` / `diagnosticsOptIn` reference (the compiler is the missed-call-site check).
- [x] 7.2 `npm run lint` — passes (no unused imports left behind, no orphaned i18n keys).
- [x] 7.3 `npm test` — passes; the six `observability-*` suites are gone and updated suites are green.
- [x] 7.4 `npm run test:browser` — onboarding + options render correctly with the consent toggle removed.
- [x] 7.5 Grep the repo for `posthog`, `PostHog`, `diagnosticsOptIn`, `telemetry.emit`, `ConsentToggle`, and `observability` (case-insensitive) and confirm only intentional history remains (the superseded-D29 note and the archived `observability` change).
