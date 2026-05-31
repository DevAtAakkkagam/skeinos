// The scheduled canary watchdog (LLD §4.3, design D-R1). The service worker has no
// DOM, so it cannot itself probe a host page — the probe is `selfCheck()`, run
// content-side and reported via `report.ts`. This module is the durable other half:
// a `chrome.alarms` schedule that, on every tick, re-surfaces still-degraded
// platforms (re-broadcasting `platform.degraded`) and re-arms their hot-fix flag,
// so a real breakage stays visible within the alarm window even across worker
// restarts. Registration is a synchronous top-level side effect at worker load
// ([SW-3]); the schedule is an alarm, never a timer ([SW-4]).

import type { PlatformId } from '../../shared/types';
import { broadcast } from '../../core/messaging';
import { getDegraded, setHealth } from './health';
import { alarms, type Alarm } from './chrome';

/** The canary alarm name. */
export const CANARY_ALARM = 'skeinos.adapter-canary';

/** How often the canary re-surfaces breakage. 6h ≤ 24h satisfies the LLD window. */
export const CANARY_PERIOD_MINUTES = 6 * 60;

/**
 * One canary tick: re-broadcast `platform.degraded` for every platform still
 * recorded as degraded, and re-arm its hot-fix flag. Emits nothing when all
 * platforms are healthy. Returns the degraded platforms it re-surfaced (for tests).
 */
export async function runCanaryTick(): Promise<PlatformId[]> {
  const degraded = await getDegraded();
  for (const platform of degraded) {
    // Re-arm the hot-fix flag (idempotent) so a long-broken platform keeps asking
    // the loader for a remote refresh, then re-surface it to any open tab.
    await setHealth(platform, { ok: false, missing: [] });
    await broadcast({ kind: 'platform.degraded', platform });
  }
  return degraded;
}

/**
 * Create the canary alarm and register its `onAlarm` listener. Call as a top-level
 * side effect in the background entry so it runs on every cold worker start before
 * any async init ([SW-3]). A no-op outside the extension runtime (no `chrome.alarms`).
 */
export function registerCanary(): void {
  const area = alarms();
  if (!area) return;
  area.create(CANARY_ALARM, { periodInMinutes: CANARY_PERIOD_MINUTES });
  area.onAlarm.addListener((alarm: Alarm) => {
    if (alarm.name === CANARY_ALARM) void runCanaryTick();
  });
}
