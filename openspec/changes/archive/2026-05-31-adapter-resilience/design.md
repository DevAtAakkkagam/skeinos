## Context

`platform-adapter` (C4) handles load-time breakage: a failed `selfCheck()` keeps
the overlay dormant and the content entry reports `platform.degraded`. What's
missing (T1.5) is (a) a **scheduled canary** that keeps a degraded
platform surfaced within 24h and flags its config for hot-fix, and (b) an
**in-product notice** so the user understands the platform is degraded and can
retry. The guardrails are firm: scheduled work uses `chrome.alarms`, not timers
([SW-4]); listeners register synchronously at worker load ([SW-3]); durable state
lives in storage and rehydrates on wake ([SW-2]); the banner mounts through the
`ui-shell` shadow-DOM harness ([PREACT]).

The hard architectural fact shaping this design: **the service worker has no DOM**,
so it cannot itself run a "DOM probe". The probe is `selfCheck()`, which only the
content script can run against the live host page.

## Goals / Non-Goals

**Goals:**
- Durable per-platform health (degraded/healthy) that survives worker death.
- A `chrome.alarms` canary watchdog that re-surfaces still-degraded platforms
  within its window and re-arms the hot-fix flag, registered synchronously at load.
- A health-report path: content `selfCheck()` result → worker persists, broadcasts
  `platform.degraded`, sets the hot-fix flag.
- A breakage-notice banner mounted on the degraded platform's tab only, with Retry
  (re-probe) and Dismiss; a healthy retry clears the notice.
- Isolation: a degraded platform never affects another platform's tab.

**Non-Goals:**
- End-to-end changelog / auto-update / 24h-notice path verification (C36).
- Host docking/reflow coexistence (C19, M4).
- A worker→tab request/response channel or any change to the `messaging` spec.
- Recovery *broadcasts* across tabs — retry-driven local clearing is enough for now.
- Platforms beyond Claude.

## Decisions

### D-R1: Probe content-side, schedule + aggregate worker-side
The canary is split: the **probe** is `adapter.selfCheck()` run in the content
script (the only context with the host DOM); the **schedule + durable aggregation**
is a `chrome.alarms` watchdog in the worker. Content reports each result; the
worker persists health, decides "degraded", notifies, and re-surfaces on each alarm
tick. *Alternative:* a worker→tab request/response so the worker pulls probes on a
tick. *Rejected* — that requires extending the `messaging` capability with a new
channel; the report-push model needs only the existing request seam and keeps this
change additive. The alarm window (≤ 24h) guarantees the LLD's "within 24 hours"
even across worker restarts.

### D-R2: Health reports ride the request seam, degraded rides the existing broadcast
Content → worker uses two declaration-merged request kinds (`platform.report-health`,
`platform.query-health`) — the documented messaging extension mechanism, so the hub
and the `messaging` spec are untouched. Worker → tabs reuses the **existing**
`platform.degraded` broadcast (already in the closed `Broadcast` union). No new
broadcast kind, so no `messaging` modification. The C4 `reportDegraded` path folds
into `reportHealth({ ok:false })`.

### D-R3: Durable health store over chrome.storage.local
Health is `Record<PlatformId, { ok: boolean; missing: string[]; updatedAt: number;
hotfixWanted: boolean }>` persisted under one `chrome.storage.local` key ([SW-2]),
read on worker wake and on each alarm tick. *Alternative:* the IndexedDB workspace
store. *Rejected* — health is operational settings-like state, not a syncable
workspace record, and must not depend on `workspace-store` (mirrors the settings
rationale, D4). `chrome.storage.local` is multi-context-safe for the content/UI
reads too.

### D-R4: Hot-fix flag nudges the loader toward a remote refresh
A degraded platform sets `hotfixWanted`. On the next `loadConfig`, that flag makes
the loader treat the bundled config as suspect and *prefer* attempting the remote
fetch (it already adopts a newer valid remote — D-A3); the flag clears when a
healthy report arrives. This is the "flags the config for hot-fix" half of §4.3
without shipping remote code ([MV3]). Keeping it a flag (not an immediate forced
fetch) avoids hammering the endpoint from every broken tab.

### D-R5: Banner is a minimal shadow-DOM notice, not the overlay
With no sidebar overlay until M2, the in-product notice is a small banner mounted
via `ui-shell`'s `mount()` harness (shadow-DOM isolated, token-styled, ARIA
`role="alert"`, keyboard-operable). It mounts only on a tab whose platform is
degraded, so isolation is structural: per-tab, platform-scoped content scripts mean
a degraded platform's banner never appears on another platform's tab. Retry re-runs
`selfCheck()` and, if healthy, disposes the banner and reports healthy. *Alternative:*
surface only in the options page. *Rejected* — the user needs the notice where the
breakage is; an options-page status can be added later (C36).

## Risks / Trade-offs

- **A broken page that never mutates won't re-probe content-side between loads** →
  `selfCheck()` on load already catches it, `observe()` catches in-session DOM
  drift, and the alarm re-surfaces the persisted degraded state within its window.
- **Alarm minimum period / flakiness in tests** → the canary logic is a pure
  function over the health store, unit-tested directly; the alarm registration is
  asserted separately against a fake `chrome.alarms`. No test depends on real timer
  fights.
- **Banner could itself collide with host chrome** → it's a compact top-anchored
  alert, not the docked panel; full coexistence/reflow is C19. Mounted through the
  isolated shadow root so host CSS can't break it ([PREACT]).
- **`alarms` permission** → minimal, justified by the canary; no host or credential
  permission added ([MV3]).

## Migration Plan

Additive: new `adapters/resilience/` module, one new `alarms` permission, and a
content-entry refinement (mount a banner on failure instead of staying silent).
Durable health state defaults to empty/healthy, so existing installs start clean.
Rollback = revert; the health key is self-initializing and ignorable.

## Open Questions

- Exact alarm period (e.g. 6h vs 12h) — settle in `tasks.md`; any value ≤ 24h meets
  the requirement. Default 6h.
- Whether a dismissed banner should re-appear on the next alarm tick or stay
  dismissed until the next load — default: re-appear while still degraded, so a real
  breakage isn't permanently silenced.
