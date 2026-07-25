// onboarding-foundation gate + settings coverage (Vitest + a fake
// `chrome.storage.local`). Each `describe` maps to one task/scenario in
// openspec/changes/onboarding-foundation/tasks.md §4.1–4.2:
//   4.1 — additive settings keys (onboardingCompleted / domain) default + round-trip
//   4.2 — gate helpers `isOnboardingComplete` / `completeOnboarding`

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  getSettings,
  setSettings,
  type Settings,
} from '../src/core/settings';
import { isOnboardingComplete, completeOnboarding } from '../src/ui/onboarding/gate';

// --- a minimal fake `chrome.storage` (mirrors tests/settings.test.ts) ------

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

describe('Additive onboarding settings keys (4.1)', () => {
  beforeEach(() => setChrome(makeChrome()));

  it('a fresh read defaults onboardingCompleted to false and domain to undefined', async () => {
    const settings = await getSettings();
    expect(settings.onboardingCompleted).toBe(false);
    expect(settings.domain).toBeUndefined();
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it('a store missing the keys falls back without dropping other keys', async () => {
    // A settings object written before onboarding existed: it has theme but
    // neither onboarding key. The defaults merge supplies the missing keys and
    // leaves the stored ones untouched (additive, never-invalidating — design D-2).
    setChrome(
      makeChrome({
        [SETTINGS_KEY]: { theme: 'light' } as Partial<Settings>,
      }),
    );

    const settings = await getSettings();
    expect(settings.onboardingCompleted).toBe(false); // missing → default
    expect(settings.domain).toBeUndefined(); // missing → undefined
    expect(settings.theme).toBe('light'); // stored value unchanged
  });

  it('written onboardingCompleted + domain round-trip across a simulated reload', async () => {
    const fake = makeChrome();
    setChrome(fake);

    await setSettings({ onboardingCompleted: true, domain: 'software-engineering' });

    // "reload": a new context over the same backing store keeps no memory state.
    setChrome(makeChrome(fake.store));
    const reloaded = await getSettings();
    expect(reloaded.onboardingCompleted).toBe(true);
    expect(reloaded.domain).toBe('software-engineering');
  });
});

describe('Gate selector isOnboardingComplete (4.2)', () => {
  it('is false for the default (first-run) settings', () => {
    expect(isOnboardingComplete(DEFAULT_SETTINGS)).toBe(false);
  });

  it('is true once onboardingCompleted is set', () => {
    expect(isOnboardingComplete({ ...DEFAULT_SETTINGS, onboardingCompleted: true })).toBe(true);
  });
});

describe('Gate writer completeOnboarding (4.2)', () => {
  it('writes onboardingCompleted: true through settings', async () => {
    const fake = makeChrome();
    setChrome(fake);

    expect((await getSettings()).onboardingCompleted).toBe(false);

    await completeOnboarding();

    // Observed through a fresh read against the same store (the write persisted).
    const after = await getSettings();
    expect(after.onboardingCompleted).toBe(true);
    expect(isOnboardingComplete(after)).toBe(true);
    // And it went through the SETTINGS_KEY record, not some side channel.
    expect((fake.store[SETTINGS_KEY] as Settings).onboardingCompleted).toBe(true);
  });
});
