## Why

`platform-adapter` already isolates a *load-time* breakage: a failed `selfCheck()`
keeps the overlay dormant and broadcasts `platform.degraded`. But host sites change
their DOM after we ship, and a silently-disabled overlay leaves the user confused
with no recourse. The LLD requires a **scheduled canary** that keeps surfacing
breakage within 24 hours and an **in-product notice** so the user knows a platform
is degraded and the config is flagged for a hot-fix (LLD §4.3; CLAUDE.md [ADAPT-3],
[SW-4]). This is M1 task T1.5 — the last slice of the adapter framework, and a
prerequisite for the M8 `maintenance` change.

## What Changes

- Add `adapter-resilience`: durable per-platform health tracking + a scheduled
  canary watchdog + a breakage-notice banner.
- **Durable health state** ([SW-2]): degraded/healthy per platform persisted in
  `chrome.storage.local`, rehydrated on worker wake — no memory-only state.
- **Health reporting**: content scripts report their `selfCheck()` result to the
  worker (via the messaging request seam, declaration-merged — the hub is not
  edited). A failing report marks the platform degraded, persists it, broadcasts
  the existing `platform.degraded`, and sets a **hot-fix flag** so the loader
  prefers re-fetching the remote config on the next load.
- **Scheduled canary** ([SW-4]): a `chrome.alarms`-driven watchdog registered
  synchronously at worker load. Because the service worker has no DOM, the *probe*
  (`selfCheck`) runs content-side; the alarm is the durable scheduler/aggregator
  that re-surfaces still-degraded platforms within its window (≤ 24h) even across
  worker restarts, and re-arms the hot-fix flag.
- **Breakage-notice banner** (consumes `ui-shell`): when a platform is degraded, a
  shadow-DOM banner mounts on **that platform's tab only**, explaining the overlay
  is unavailable, with **Retry** (re-probe `selfCheck`; clear the notice if healthy)
  and **Dismiss**. A degraded platform affects only its own tab — isolation holds.

Out of scope (deferred): the changelog + auto-update + in-product 24h notice *path
verification* end-to-end (C36 `maintenance`, T8.6, depends on this); full
docking/reflow host coexistence (C19, M4); any platform beyond Claude.

## Capabilities

### New Capabilities
- `adapter-resilience`: keeping a degraded platform observable and recoverable —
  durable per-platform health state, the `chrome.alarms` canary watchdog, the
  health-report → degraded-broadcast + hot-fix-flag path, and the per-platform
  breakage-notice banner with retry, all isolated to the affected platform.

### Modified Capabilities
<!-- None. Reuses the existing `platform.degraded` broadcast and the request seam
     (declaration merging) without changing the `messaging` spec, and consumes the
     `ui-shell` mount harness without changing its spec. `platform-adapter` is
     unchanged: the overlay still stays dormant on a failed selfCheck — the banner
     is a notice, not the overlay. -->

## Impact

- **New module** `extension/src/adapters/resilience/` — health store (over
  `chrome.storage.local`), the canary alarm (registered in the background entry),
  the health-report handler + `reportHealth` client, and the banner component
  (built on `src/ui/mount.ts` + base components).
- **Background entry**: registers the canary alarm listener synchronously at load
  ([SW-3]) and the health-report handler on activation; rehydrates health on wake.
- **Content entry** (refinement): on a failed `selfCheck()` it now also mounts the
  breakage banner (in addition to the existing `platform.degraded` report) rather
  than staying fully silent — isolated to the current tab/platform.
- **Permissions** ([MV3]): adds the `alarms` permission (no host change; Claude’s
  host permission already ships). Justified: the scheduled canary.
- **No new runtime dependencies**. Tested with Vitest + a fake `chrome`
  (alarms/storage) and happy-dom for the banner; the headline test simulates a
  broken config and asserts the banner is raised and isolated to that platform.
- **Downstream**: completes the adapter framework (M1) and unblocks C36
  `maintenance` (breakage-notice path + auto-update).
