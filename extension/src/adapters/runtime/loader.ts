// Config loader (LLD §4.3, design D-A3): always start from a bundled config, then
// adopt a remote (or cached last-known-good) config ONLY when it both validates
// against the schema and carries a newer semver `configVersion`. Any fetch, parse,
// or validation failure keeps the bundled config, so the extension works offline
// and never adopts a broken or unsafe selector set. Remote config is data only —
// no code is ever loaded (CLAUDE.md [MV3]).

import type { PlatformId } from '../../shared/types';
import { storageLocal } from '../../core/settings/chrome';
import type { AdapterConfig } from '../types';
import { getBundledConfig } from '../configs';
import { isValidationErrors, validateAdapterConfig } from './validate';

/** Where remote selector hot-fixes are published, per platform. */
const REMOTE_CONFIG_BASE = 'https://skeinos.aakkagam.com/adapters';
const CACHE_PREFIX = 'skeinos.adapterConfig.';

/** A durable last-known-good cache for adopted remote configs (survives SW death). */
export interface ConfigCache {
  read(platformId: PlatformId): Promise<unknown>;
  write(platformId: PlatformId, config: AdapterConfig): Promise<void>;
}

/** Injectable seams so the loader is unit-testable without network or `chrome`. */
export interface LoaderOptions {
  /** Override the bundled baseline (defaults to the shipped config). */
  bundled?: AdapterConfig | null;
  /** Fetch the remote config as parsed JSON; reject/throw on any failure. */
  fetchRemote?: (platformId: PlatformId) => Promise<unknown>;
  /** Durable cache (defaults to `chrome.storage.local`). */
  cache?: ConfigCache;
  /**
   * Whether to attempt the remote config refresh (design D-R4). The caller passes
   * the platform's hot-fix flag: a degraded platform (flag set) wants a remote
   * selector fix, a healthy one stays frugal and skips the network. Defaults to
   * `true` so a caller that does not track health keeps the always-refresh
   * behaviour. Only schema-validated config *data* is ever adopted — never code.
   */
  hotfixWanted?: boolean;
}

/** Compare two semver strings. Returns -1, 0, or 1 (a vs b). */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** Adopt `candidate` over `current` iff it validates and is strictly newer. */
function adopt(current: AdapterConfig, candidate: unknown): AdapterConfig {
  const validated = validateAdapterConfig(candidate);
  if (isValidationErrors(validated)) return current;
  if (validated.platformId !== current.platformId) return current;
  return compareVersions(validated.configVersion, current.configVersion) > 0 ? validated : current;
}

const chromeCache: ConfigCache = {
  async read(platformId) {
    const area = storageLocal();
    if (!area) return undefined;
    const key = CACHE_PREFIX + platformId;
    const got = await area.get(key);
    return got[key];
  },
  async write(platformId, config) {
    const area = storageLocal();
    if (!area) return;
    await area.set({ [CACHE_PREFIX + platformId]: config });
  },
};

async function defaultFetchRemote(platformId: PlatformId): Promise<unknown> {
  const res = await fetch(`${REMOTE_CONFIG_BASE}/${platformId}.json`);
  if (!res.ok) throw new Error(`remote config HTTP ${res.status}`);
  return res.json();
}

async function safe<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch {
    return undefined;
  }
}

/**
 * Resolve the config to use for a platform: bundled, unless a cached or remote
 * config validates and is newer. The newest adopted config is written back to the
 * cache as the next cold start's baseline.
 */
export async function loadConfig(
  platformId: PlatformId,
  options: LoaderOptions = {},
): Promise<AdapterConfig | null> {
  const bundled = options.bundled ?? getBundledConfig(platformId) ?? null;
  if (!bundled) return null;

  const cache = options.cache ?? chromeCache;
  const fetchRemote = options.fetchRemote ?? defaultFetchRemote;

  // Start from the bundled baseline; layer in the cached last-known-good, then the
  // freshest remote. Each step only wins if it validates and is strictly newer.
  let best = bundled;
  const cached = await safe(() => cache.read(platformId));
  if (cached !== undefined) best = adopt(best, cached);

  // The remote refresh is attempted only when wanted — a degraded platform's
  // hot-fix flag forces it; a healthy platform skips the network (design D-R4).
  if (options.hotfixWanted ?? true) {
    const remote = await safe(() => fetchRemote(platformId));
    if (remote !== undefined) best = adopt(best, remote);
  }

  // Persist the newest valid config as the baseline for the next cold start.
  if (best !== bundled) await safe(() => cache.write(platformId, best));

  return best;
}
