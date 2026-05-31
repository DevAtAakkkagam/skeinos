// Durable per-platform health (design D-R3, guardrail SW-2). Whether a platform's
// last `selfCheck()` passed, which anchors were missing, and whether its config is
// flagged for a hot-fix all live under ONE `chrome.storage.local` key and are read
// back on every worker wake — no health state ever lives only in worker memory.
//
// Health is operational, settings-like state, not a syncable workspace record, so
// it sits on `chrome.storage.local` (the same area as adapter config cache and
// settings) and never touches the IndexedDB workspace store.

import type { PlatformId } from '../../shared/types';
import { storageLocal } from '../../core/settings/chrome';
import type { SelfCheckResult } from '../types';

/** The single `chrome.storage.local` key holding the whole health map. */
const HEALTH_KEY = 'skeinos.platformHealth';

/** Recorded health for one platform. */
export interface PlatformHealth {
  /** Whether the last reported `selfCheck()` passed. */
  ok: boolean;
  /** Selector keys whose anchors did not resolve on that check. Empty when `ok`. */
  missing: string[];
  /** When this record was last written (epoch ms). */
  updatedAt: number;
  /** Set while the platform is degraded: nudges the loader toward a remote refresh. */
  hotfixWanted: boolean;
}

/** A brand-new / never-reported platform is treated as healthy. */
function healthy(): PlatformHealth {
  return { ok: true, missing: [], updatedAt: 0, hotfixWanted: false };
}

/** The whole persisted map, keyed by platform. Missing/unreadable storage → `{}`. */
async function readMap(): Promise<Partial<Record<PlatformId, PlatformHealth>>> {
  const area = storageLocal();
  if (!area) return {};
  const got = await area.get(HEALTH_KEY);
  const map = got[HEALTH_KEY];
  return typeof map === 'object' && map !== null
    ? (map as Partial<Record<PlatformId, PlatformHealth>>)
    : {};
}

async function writeMap(map: Partial<Record<PlatformId, PlatformHealth>>): Promise<void> {
  const area = storageLocal();
  if (!area) return;
  await area.set({ [HEALTH_KEY]: map });
}

/** Read every recorded platform's health (rehydrated from storage on each call). */
export async function getHealth(): Promise<Partial<Record<PlatformId, PlatformHealth>>> {
  return readMap();
}

/** Read one platform's health, defaulting an unknown platform to healthy. */
export async function getPlatformHealth(platform: PlatformId): Promise<PlatformHealth> {
  const map = await readMap();
  return map[platform] ?? healthy();
}

/** Every platform currently recorded as degraded (last check failed). */
export async function getDegraded(): Promise<PlatformId[]> {
  const map = await readMap();
  return (Object.keys(map) as PlatformId[]).filter((p) => map[p]?.ok === false);
}

/**
 * Persist a platform's latest `selfCheck()` result. A failing check marks the
 * platform degraded and arms its hot-fix flag; a passing check records it healthy
 * with the flag cleared. Returns the stored record.
 */
export async function setHealth(
  platform: PlatformId,
  result: SelfCheckResult,
): Promise<PlatformHealth> {
  const map = await readMap();
  const record: PlatformHealth = {
    ok: result.ok,
    missing: [...result.missing],
    updatedAt: Date.now(),
    hotfixWanted: !result.ok,
  };
  map[platform] = record;
  await writeMap(map);
  return record;
}

/** Clear a platform's record entirely — it reads back as healthy afterwards. */
export async function clearHealth(platform: PlatformId): Promise<void> {
  const map = await readMap();
  if (map[platform] === undefined) return;
  delete map[platform];
  await writeMap(map);
}
