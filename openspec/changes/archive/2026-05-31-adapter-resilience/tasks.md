## 1. Durable health store

- [x] 1.1 Add `extension/src/adapters/resilience/health.ts`: a `PlatformHealth`
  record (`ok`, `missing`, `updatedAt`, `hotfixWanted`) and async accessors over a
  single `chrome.storage.local` key — `getHealth()`, `getPlatformHealth(p)`,
  `setHealth(p, result)`, `clearHealth(p)` (D-R3, [SW-2])
- [x] 1.2 Default unknown platforms to healthy; rehydrate on read (no memory-only
  state)
- [x] 1.3 Unit-test: degraded persists and reads back; passing report clears
  degraded + hot-fix flag; unknown platform reads healthy

## 2. Health-report messaging (request seam)

- [x] 2.1 In `extension/src/adapters/resilience/report.ts` declaration-merge two
  request kinds — `platform.report-health` ({ platform, result }) and
  `platform.query-health` ({}) — and add the `reportHealth` / `queryHealth` client
  helpers (D-R2; hub untouched)
- [x] 2.2 Worker handler for `platform.report-health`: persist via the health store;
  on failure broadcast the existing `platform.degraded` and set the hot-fix flag;
  on success clear degraded + hot-fix
- [x] 2.3 Worker handler for `platform.query-health`: return the current degraded set
- [x] 2.4 Replace the C4 `reportDegraded` call path with `reportHealth({ ok:false })`
  (fold degraded reporting into health reporting)
- [x] 2.5 Unit-test the handlers with a fake `chrome`: failing report → persisted
  degraded + `platform.degraded` broadcast + hot-fix set; passing → cleared

## 3. Scheduled canary watchdog (chrome.alarms)

- [x] 3.1 Add `extension/src/adapters/resilience/canary.ts`: `registerCanary()`
  that creates a `chrome.alarms` alarm (period ≤ 24h; default 6h) and registers the
  `onAlarm` listener synchronously ([SW-3], [SW-4])
- [x] 3.2 Canary tick = pure function over the health store: re-broadcast
  `platform.degraded` for every still-degraded platform; re-arm the hot-fix flag;
  emit nothing when all healthy
- [x] 3.3 Add a minimal structural `chrome.alarms` view to a chrome accessor
  (mirroring `core/messaging/chrome.ts`) so it is fake-able in tests
- [x] 3.4 Wire `registerCanary()` into the background entry at module load; add the
  `alarms` permission to the manifest (`manifest.config.ts`) with a justification
- [x] 3.5 Unit-test: alarm + onAlarm registered at load against a fake `chrome`;
  tick re-broadcasts for a degraded platform; tick is silent when all healthy

## 4. Hot-fix flag → loader nudge

- [x] 4.1 Thread the hot-fix flag into `loadConfig`: when set for a platform, the
  loader attempts the remote fetch on next load (extends D-A3); flag clears on a
  passing report (D-R4) — data only, no remote code ([MV3])
- [x] 4.2 Unit-test: a hot-fix-flagged platform triggers a remote fetch attempt;
  an unflagged one keeps the existing behavior

## 5. Breakage-notice banner (ui-shell)

- [x] 5.1 Add `extension/src/adapters/resilience/Banner.tsx`: a token-styled Preact
  banner (uses base components), `role="alert"`, keyboard-operable, with Retry and
  Dismiss; no hard-coded colors/strings beyond i18n-ready labels ([PREACT])
- [x] 5.2 Add `mountBanner(adapter, platform)` that mounts the banner on the current
  tab via `ui-shell`'s `mount()` and returns a disposer (D-R5)
- [x] 5.3 Retry re-runs `adapter.selfCheck()`; on pass → dispose banner +
  `reportHealth({ ok:true })`; Dismiss → dispose for this session
- [x] 5.4 Content-entry refinement: on a failed `selfCheck()` mount the banner (in
  addition to reporting health) instead of staying silent; healthy platforms mount
  no banner (isolation)
- [x] 5.5 Test (happy-dom): a simulated broken config mounts the banner in a shadow
  root with Retry/Dismiss + alert role; a healthy platform mounts none; retry on a
  recovered selfCheck disposes the banner

## 6. Verification

- [x] 6.1 `npm test` / `npm run typecheck` green; `wxt build` succeeds with the new
  `alarms` permission in the built manifest
- [x] 6.2 Headline DoD (T1.5): simulated broken config raises the banner and
  isolates only that platform — covered by an explicit test
- [x] 6.3 Confirm `core/` imports nothing from `adapters/`; canary uses
  `chrome.alarms`, never `setTimeout`/`setInterval` ([SW-4])
- [x] 6.4 Update `tasks.md` checkboxes; ready to archive
