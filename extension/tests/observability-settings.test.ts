// Consent-flag settings coverage (settings spec "Diagnostics consent flag", task
// 2.4): the diagnostics flag defaults OFF (opt-in), persists across a reload, and a
// live change reaches a worker-side subscriber before the next gate check.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getSettings,
  setSettings,
  subscribeSettings,
  type Settings,
} from '../src/core/settings';

function makeChrome(seed: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = { ...seed };
  const listeners = new Set<(c: Record<string, { newValue?: unknown }>, a: string) => void>();
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
          const changes: Record<string, { newValue?: unknown }> = {};
          for (const [k, v] of Object.entries(items)) {
            changes[k] = { newValue: v };
            store[k] = v;
          }
          for (const cb of listeners) cb(changes, 'local');
        },
      },
      onChanged: {
        addListener: (cb: (c: Record<string, { newValue?: unknown }>, a: string) => void) =>
          void listeners.add(cb),
        removeListener: (cb: (c: Record<string, { newValue?: unknown }>, a: string) => void) =>
          void listeners.delete(cb),
      },
    },
  };
}
const originalChrome = (globalThis as { chrome?: unknown }).chrome;
function setChrome(c: unknown) {
  (globalThis as { chrome?: unknown }).chrome = c;
}
afterEach(() => setChrome(originalChrome));

describe('Diagnostics consent defaults off (2.4)', () => {
  beforeEach(() => setChrome(makeChrome()));
  it('a fresh read returns the diagnostics opt-in off by default', async () => {
    const s = await getSettings();
    expect(s.diagnosticsOptIn).toBe(false);
  });
});

describe('Diagnostics consent persists across reload (2.4)', () => {
  it('an enabled flag reads back after a simulated reload', async () => {
    const fake = makeChrome();
    setChrome(fake);
    await setSettings({ diagnosticsOptIn: true });

    setChrome(makeChrome(fake.store)); // new context, same backing store
    const reloaded = await getSettings();
    expect(reloaded.diagnosticsOptIn).toBe(true);
  });
});

describe('Live change reaches the worker (2.4)', () => {
  beforeEach(() => setChrome(makeChrome()));
  it('a consent change notifies a subscriber with the new value', async () => {
    const seen: Settings[] = [];
    const dispose = subscribeSettings((s) => seen.push(s));

    await setSettings({ diagnosticsOptIn: true });

    expect(seen).toHaveLength(1);
    expect(seen[0].diagnosticsOptIn).toBe(true);
    dispose();
  });
});
