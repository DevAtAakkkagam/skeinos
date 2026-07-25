# Remove the observability (diagnostics telemetry) feature

## Why

The `observability` change (D29, shipped 2026-06-26) added an opt-in diagnostics
stream that POSTs crash and adapter-health events to PostHog EU Cloud. It is the
**only** code path that sends anything off the device. Removing it makes the
privacy story absolute — Skeinos contacts zero external network endpoints on any
tier — and deletes a standing maintenance, consent, and store-disclosure surface
we have decided is not worth the early-stage signal. This supersedes D29.

## What Changes

- **BREAKING (internal):** delete the `observability` capability in full — no
  telemetry of any kind ships. There is no replacement endpoint.
- Delete `extension/src/core/observability/` (all 13 modules: egress, builder,
  validator, scrubber, identity, taxonomy, buffer, client, config, chrome, types,
  index) and its 6 test files.
- Remove the worker wiring in `background/index.ts`
  (`registerTelemetryHandlers`, `registerTelemetryFlush`, `installExceptionCapture`)
  and the `telemetry.emit` request contract (declared inside the deleted egress module).
- Remove every emit call site: `content/index.ts` (`track`, `installExceptionCapture`)
  and the `recordEvent` diagnostics inside `adapters/resilience/report.ts`. The
  resilience **health persistence + `platform.degraded` broadcast stay** — only the
  diagnostics side effects and their now-dead `configVer`/anchor plumbing are removed.
- Remove the user-facing consent surface: delete `ui/components/ConsentToggle.tsx`,
  the diagnostics opt-in on the final onboarding step (`OnboardingSurface.tsx`) and in
  Settings → Privacy (`OptionsApp.tsx`), the `.sk-consent*` styles, and the
  `diagnosticsOptIn` field + default in `shared/settings.ts`. The onboarding step count
  is unchanged (the toggle was embedded in the final step, not its own step).
- Remove the associated i18n keys (`onboarding.consent*`, `options.diagnostics*`)
  across all five locales (en, de, es, fr, pt).
- Remove all PostHog / diagnostics text from `website/privacy/index.html`,
  `docs/PRIVACY.md`, and `docs/STORE_DATA_USE.md`.
- Add a DECISIONS entry superseding **D29**.

Out of scope: the legacy, unused `Settings.telemetry` boolean (a never-wired
usage-telemetry placeholder, off by default) is left as-is — it is not PostHog-related
and removing it is a separate cleanup.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `observability`: **removed in full.** Every requirement in the current
  `openspec/specs/observability/spec.md` is deleted; no diagnostics behavior remains.
  The spec delta records all nine requirements under `## REMOVED Requirements`.
- `settings`: the **Diagnostics consent flag** requirement is removed — `diagnosticsOptIn`
  no longer exists in `Settings`/`DEFAULT_SETTINGS` and has no options-page toggle.
- `onboarding`: the **Final step surfaces diagnostics consent** requirement is removed —
  the final step no longer renders a consent toggle and `finish` commits no consent.
  `STEP_COUNT` and the step dots are unchanged (the toggle sat inside the final step).
- `adapter-resilience`: the **Resilience emits diagnostics telemetry** and **Signed-out
  tabs are excluded from breakage telemetry** requirements are removed. The health
  machinery (degraded state, hot-fix flag, `platform.degraded` broadcast, banner,
  signed-out classification) is untouched — only the emit side effects are gone.

## Impact

- **Code:** deletes `core/observability/` + `ConsentToggle`; surgical edits to
  `background/index.ts`, `content/index.ts`, `adapters/resilience/report.ts`,
  `shared/settings.ts`, `ui/onboarding/OnboardingSurface.tsx`,
  `ui/options/OptionsApp.tsx`, `ui/styles.ts`, and the five locale catalogs.
- **Tests:** deletes the 6 `observability-*` test files; fixes one stray
  `diagnosticsOptIn` fixture in `tests/input-bar-profile-chip.test.tsx`. Onboarding
  and options tests that asserted the consent toggle are updated.
- **Network / permissions:** removes the only external egress. No manifest change
  (the feature never required a host permission or `connect-src` entry, so there is
  nothing to unwind there) — but the "no network path for content" claim now extends
  to "no network path at all."
- **Docs & disclosure:** privacy policy, store data-use disclosure, and DECISIONS.
- **Spec:** `openspec/specs/observability/spec.md` is retired via this change's delta;
  the stale diagnostics requirements in `specs/settings` and `specs/onboarding` are
  retired by their own `## REMOVED Requirements` deltas in the same change.
