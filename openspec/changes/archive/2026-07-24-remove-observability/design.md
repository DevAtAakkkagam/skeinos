## Context

`observability` (D29) is a diagnostics-only telemetry pipeline: content/UI emit a
`telemetry.emit` request → the worker gates on `diagnosticsOptIn`, builds an
allowlisted payload, buffers it in `chrome.storage.local`, and a `chrome.alarms`
flush POSTs it to PostHog EU. It is the single external egress in the whole product.
Removing it is a deletion, not a redesign — the design work is entirely about doing
the deletion cleanly without collateral damage to the two systems it is entangled
with: adapter resilience and onboarding/settings.

Two entanglements matter:

1. **`adapters/resilience/report.ts`** hosts both the real health machinery
   (persist degraded state, fan out the `platform.degraded` broadcast) *and*
   diagnostics side effects (`recordEvent` on self-check failure / recovery, plus the
   `configVer` + anchor-key plumbing that exists only to label those events). The file
   must survive; only the diagnostics half is cut.
2. **The consent UI** is diagnostics-only and appears in exactly two places
   (final onboarding step, Settings → Privacy) via one shared `ConsentToggle`
   component. The toggle sits inside the final onboarding step, so removing it does
   not change `STEP_COUNT` or the step-dot count.

## Goals / Non-Goals

**Goals:**

- The extension contacts zero external network endpoints. No `telemetry.emit`
  contract, no PostHog config, no egress transport, no buffered events.
- No user-facing trace of diagnostics: no onboarding opt-in, no Settings toggle, no
  locale strings, no privacy-policy / store-disclosure mention of PostHog.
- Adapter resilience keeps working unchanged (self-check → degraded → banner →
  hot-fix), minus the telemetry it used to emit.
- `typecheck`, `lint`, `test`, and `test:browser` all pass with the six
  `observability-*` suites removed and dependent tests updated.

**Non-Goals:**

- Removing the legacy `Settings.telemetry` boolean (unused PRD §8.3 placeholder,
  not PostHog-related). Left for a separate cleanup.
- Any manifest / permissions change. The feature never required a host permission,
  `connect-src` entry, or `<all_urls>`, so there is nothing to unwind.
- Preserving diagnostics in any local-only form. This is a full removal, per the
  scoping decision — not "keep it local."

## Decisions

### D-1 — Delete the capability, don't stub it

`core/observability/` is removed wholesale (13 modules + `index.ts` barrel). Because
the `telemetry.emit` request contract is declared *inside* `egress.ts` via
declaration-merging on `RequestContracts`, deleting the module also deletes the
contract — no separate messaging-spec edit is needed, and the messaging hub is
untouched. Any residual import of `../core/observability` becomes a compile error,
which is the desired tripwire: `typecheck` enumerates every remaining call site.

### D-2 — Surgical edit of `report.ts`, keep the request seam

Keep `registerResilienceHandlers`, `reportHealth`, `queryHealth`, and the
`platform.report-health` / `platform.query-health` contracts. Remove: the
`recordEvent` import and both call sites (self-check-failed loop, recovered),
the `ANCHOR_KEYS` / `AnchorKey` import, and the `toAnchorKey` / `safeVer` helpers.
The `configVer` field existed only to label diagnostics events; with diagnostics gone
it is dead, so drop it from the `platform.report-health` request contract and from the
`reportHealth(platform, result, configVer?)` signature, then update the (few) callers.
This keeps the resilience contract honest rather than carrying a vestigial parameter.

### D-3 — Remove the consent surface, preserve onboarding shape

Delete `ConsentToggle.tsx` (no other consumer). In `OnboardingSurface.tsx` remove the
import, the `consent` state, `toggleConsent`, the `persistConsent` prop + its
default, the commit-on-finish `persistConsent(...)` call, and the rendered
`<ConsentToggle>` in the final step. `STEP_COUNT`, step indices, and the dots are
unchanged. In `OptionsApp.tsx` remove the import, `toggleConsent`, and the rendered
toggle; if that empties the Privacy section, drop the now-empty section and its
heading rather than leaving a bare header (per §29 fragmented-header hygiene). Remove
`.sk-consent*` from `ui/styles.ts` and the `onboarding.consent*` / `options.diagnostics*`
keys from all five locales (the i18n completeness test requires every locale to carry
the same key set, so they must be removed in lockstep).

### D-4 — Settings shape

Remove `diagnosticsOptIn` from the `Settings` interface and `DEFAULT_SETTINGS`. It is
an additive optional-style key read through a defaults merge, so an installed profile
that still has `diagnosticsOptIn: true` on disk simply reads back an object where the
key is ignored — no migration is required (settings are a defaults-merged blob, not a
`Repo<T>` store with a migration list). Fix the one stray fixture in
`tests/input-bar-profile-chip.test.tsx`.

### D-5 — Docs, disclosure, and the decision log

Strip the PostHog/diagnostics paragraph from `website/privacy/index.html`,
`docs/PRIVACY.md`, and `docs/STORE_DATA_USE.md`, replacing it (where a positive claim
reads better than a deletion) with the stronger statement that Skeinos makes no
external network requests. Do **not** rewrite history in DECISIONS: add a new dated
entry that supersedes D29 and annotate D29 as superseded, so the rationale trail stays
intact.

### D-6 — Spec removal via delta

This change's `specs/observability/spec.md` is a delta listing every current
requirement under `## REMOVED Requirements`. On archive, that retires the live
`openspec/specs/observability/spec.md` capability.

## Risks / Trade-offs

- **Losing adapter-break visibility.** Diagnostics were the signal that a host
  changed its DOM in the field. Trade-off accepted per the scoping decision; the
  manual `ui-validate` / sanity-check flow (see `docs/RUNBOOK_SANITY_CHECK.md`) is
  now the sole mechanism, and the in-product degraded banner still tells the user.
- **Store-listing consistency.** The Chrome/Firefox data-use disclosures must be
  updated in the dashboards too, not only in-repo, or the published listing will
  over-declare. Flag for the maintainer at apply time; it is a manual store action
  outside the repo.
- **Missed call site.** Mitigated by D-1: any dangling `observability` import fails
  `typecheck`, so the compiler is the completeness check, not human diligence.
- **Reintroduction.** With the capability spec retired, a future telemetry feature is
  a fresh proposal, not a silent re-add — which is the intended friction.
