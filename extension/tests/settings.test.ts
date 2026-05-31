// settings spec coverage (Vitest + a fake `chrome.storage.local`). Each
// `describe` maps to one task/scenario in openspec/changes/settings.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  getSettings,
  setSettings,
  subscribeSettings,
  type Settings,
} from '../src/core/settings';

// --- a minimal fake `chrome.storage` --------------------------------------

type ChangeListener = (
  changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
  areaName: string,
) => void;

function makeChrome(seed: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = { ...seed };
  const listeners = new Set<ChangeListener>();
  return {
    store,
    storage: {
      local: {
        async get(keys: string | string[] | null) {
          if (keys == null) return { ...store };
          const ks = Array.isArray(keys) ? keys : [keys];
          const out: Record<string, unknown> = {};
          for (const k of ks) if (k in store) out[k] = store[k];
          return out;
        },
        async set(items: Record<string, unknown>) {
          const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
          for (const [k, v] of Object.entries(items)) {
            changes[k] = { oldValue: store[k], newValue: v };
            store[k] = v;
          }
          for (const cb of listeners) cb(changes, 'local');
        },
      },
      onChanged: {
        addListener: (cb: ChangeListener) => void listeners.add(cb),
        removeListener: (cb: ChangeListener) => void listeners.delete(cb),
      },
    },
  };
}

const originalChrome = (globalThis as { chrome?: unknown }).chrome;
function setChrome(c: unknown) {
  (globalThis as { chrome?: unknown }).chrome = c;
}
afterEach(() => setChrome(originalChrome));

describe('Privacy-first defaults (3.1)', () => {
  beforeEach(() => setChrome(makeChrome()));

  it('a fresh read returns telemetry off + theme system', async () => {
    const settings = await getSettings();
    expect(settings.telemetry).toBe(false);
    expect(settings.theme).toBe('system');
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });
});

describe('Persistence (3.2)', () => {
  it('a setSettings value survives a simulated reload', async () => {
    // getSettings reads chrome.storage.local on every call, so a second read
    // against the same backing store simulates a context reload (no in-memory
    // state is kept) — the D4 guarantee.
    const fake = makeChrome();
    setChrome(fake);

    await setSettings({ theme: 'dark' });

    setChrome(makeChrome(fake.store)); // "reload": new context, same stored data
    const reloaded = await getSettings();
    expect(reloaded.theme).toBe('dark');
  });

  it('a partial store falls back to defaults for missing keys', async () => {
    // Only `theme` was ever stored; `telemetry` must come from the defaults.
    setChrome(makeChrome({ [SETTINGS_KEY]: { theme: 'light' } as Partial<Settings> }));

    const settings = await getSettings();
    expect(settings.theme).toBe('light'); // stored value wins
    expect(settings.telemetry).toBe(false); // missing key → default
  });
});

describe('onChanged subscription (3.3)', () => {
  beforeEach(() => setChrome(makeChrome()));

  it('a subscriber fires with the updated settings', async () => {
    const seen: Settings[] = [];
    const dispose = subscribeSettings((s) => seen.push(s));

    await setSettings({ theme: 'dark' });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({ ...DEFAULT_SETTINGS, theme: 'dark' });

    dispose();
    await setSettings({ theme: 'light' });
    expect(seen).toHaveLength(1); // no further calls after dispose
  });
});
