// Settings.activeProfileId (profile-activation 4.2): the device-local id of the
// globally active instruction profile. Additive optional key — undefined on a fresh
// read, round-trips through get/setSettings, notifies subscribers, and a stored
// settings object missing the key never invalidates the other keys. Uses the same
// fake `chrome.storage.local` shape as tests/settings.test.ts (the D4 contract).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  getSettings,
  setSettings,
  subscribeSettings,
  type Settings,
} from '../src/core/settings';

// --- a minimal fake `chrome.storage` (mirrors tests/settings.test.ts) ----------

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

describe('Settings.activeProfileId (4.2)', () => {
  beforeEach(() => setChrome(makeChrome()));

  it('defaults to undefined on a fresh read (not in DEFAULT_SETTINGS)', async () => {
    expect('activeProfileId' in DEFAULT_SETTINGS).toBe(false);
    const settings = await getSettings();
    expect(settings.activeProfileId).toBeUndefined();
  });

  it('a written value round-trips via getSettings', async () => {
    await setSettings({ activeProfileId: 'profile-42' });
    const settings = await getSettings();
    expect(settings.activeProfileId).toBe('profile-42');
  });

  it('setting activeProfileId notifies subscribeSettings subscribers', async () => {
    const seen: Settings[] = [];
    const dispose = subscribeSettings((s) => seen.push(s));

    await setSettings({ activeProfileId: 'profile-7' });

    expect(seen).toHaveLength(1);
    expect(seen[0].activeProfileId).toBe('profile-7');

    dispose();
    await setSettings({ activeProfileId: 'profile-8' });
    expect(seen).toHaveLength(1); // no further calls after dispose
  });

  it('a stored object missing activeProfileId still reads the other keys correctly', async () => {
    // An install written before the key existed: theme is stored, activeProfileId is not.
    setChrome(makeChrome({ [SETTINGS_KEY]: { theme: 'dark' } as Partial<Settings> }));

    const settings = await getSettings();
    expect(settings.activeProfileId).toBeUndefined(); // missing → undefined
    expect(settings.theme).toBe('dark'); // other keys unaffected
    expect(settings.onboardingCompleted).toBe(false); // missing → default
  });
});
