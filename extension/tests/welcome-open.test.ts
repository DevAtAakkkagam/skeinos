// Open-on-install wiring for the welcome page (install-welcome). Proves the tab
// opens exactly once on a genuine install, the `welcomeShown` guard blocks a
// re-open (e.g. an unpacked dev reload, which also fires `onInstalled` with
// reason `install`), and non-install reasons never open it. A fake `chrome`
// combines `runtime.onInstalled`/`getURL`, `tabs.create`, and the D4
// `storage.local` (settings) shape used by tests/settings.test.ts.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { openWelcomeOnce, registerWelcomeTab } from '../src/background/welcomeTab';
import { SETTINGS_KEY } from '../src/core/settings';

type InstalledCb = (details: { reason?: string }) => void;

function makeChrome(seed: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = { ...seed };
  let installedCb: InstalledCb | undefined;
  const create = vi.fn(async () => {});
  return {
    store,
    create,
    fireInstalled: (reason: string) => installedCb?.({ reason }),
    chrome: {
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
            for (const [k, v] of Object.entries(items)) store[k] = v;
          },
        },
        onChanged: { addListener() {}, removeListener() {} },
      },
      runtime: {
        getURL: (p: string) => `chrome-extension://test/${p}`,
        onInstalled: { addListener: (cb: InstalledCb) => void (installedCb = cb) },
      },
      tabs: { create },
    },
  };
}

const originalChrome = (globalThis as { chrome?: unknown }).chrome;
const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  (globalThis as { chrome?: unknown }).chrome = originalChrome;
  vi.restoreAllMocks();
});

describe('openWelcomeOnce', () => {
  it('opens welcome.html and sets the welcomeShown guard on a fresh install', async () => {
    const fake = makeChrome();
    (globalThis as { chrome?: unknown }).chrome = fake.chrome;

    await openWelcomeOnce();

    expect(fake.create).toHaveBeenCalledTimes(1);
    expect(fake.create).toHaveBeenCalledWith({ url: 'chrome-extension://test/welcome.html' });
    expect((fake.store[SETTINGS_KEY] as { welcomeShown?: boolean }).welcomeShown).toBe(true);
  });

  it('does not reopen when the guard is already set (dev reload)', async () => {
    const fake = makeChrome({ [SETTINGS_KEY]: { welcomeShown: true } });
    (globalThis as { chrome?: unknown }).chrome = fake.chrome;

    await openWelcomeOnce();

    expect(fake.create).not.toHaveBeenCalled();
  });

  it('is a no-op when the tabs/runtime APIs are absent', async () => {
    (globalThis as { chrome?: unknown }).chrome = { storage: { local: { get: async () => ({}), set: async () => {} } } };
    await expect(openWelcomeOnce()).resolves.toBeUndefined();
  });
});

describe('registerWelcomeTab', () => {
  it('opens on reason "install" only, not "update"', async () => {
    const fake = makeChrome();
    (globalThis as { chrome?: unknown }).chrome = fake.chrome;

    registerWelcomeTab();

    fake.fireInstalled('update');
    await flush();
    expect(fake.create).not.toHaveBeenCalled();

    fake.fireInstalled('install');
    await flush();
    await flush();
    expect(fake.create).toHaveBeenCalledTimes(1);
  });
});
