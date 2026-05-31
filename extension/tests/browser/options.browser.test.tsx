import { describe, it, expect, afterEach } from 'vitest';
import { h } from 'preact';
import { mount } from '../../src/ui/mount';
import { OptionsApp } from '../../src/ui/options/OptionsApp';
import { getSettings, SETTINGS_KEY } from '../../src/core/settings';
import type { Theme } from '../../src/shared/settings';

// Runs in real Chromium. Extension storage APIs aren't available to a plain
// page, so a fake `chrome.storage.local` stands in for persistence (which is
// also unit-tested); what this lane uniquely proves is that the options page
// *opens*, renders, and that a theme change re-resolves the real CSS tokens.

type ChangeListener = (changes: Record<string, unknown>, areaName: string) => void;

function installFakeChrome(seed: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = { ...seed };
  const listeners = new Set<ChangeListener>();
  (globalThis as { chrome?: unknown }).chrome = {
    storage: {
      local: {
        async get(keys: string | null) {
          if (keys == null) return { ...store };
          return keys in store ? { [keys]: store[keys] } : {};
        },
        async set(items: Record<string, unknown>) {
          const changes: Record<string, unknown> = {};
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
  return store;
}

afterEach(() => {
  document.body.innerHTML = '';
  // Real Chromium's `window.chrome` may be non-configurable, so reset rather
  // than delete.
  (globalThis as { chrome?: unknown }).chrome = undefined;
});

function openOptions(initialTheme: Theme) {
  // Mirrors src/entrypoints/options/main.ts.
  const handle = mount(
    document.body,
    h(OptionsApp, { onThemeChange: (t: Theme) => handle.setTheme(t) }),
    { theme: initialTheme },
  );
  return handle;
}

async function tick() {
  // Let the effect's getSettings() promise resolve and Preact re-render.
  await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
}

async function waitFor(cond: () => boolean, tries = 50) {
  for (let i = 0; i < tries; i++) {
    if (cond()) return;
    await tick();
  }
  throw new Error('waitFor: condition not met');
}

describe('options page persists a theme change (real browser)', () => {
  it('opens, persists the chosen theme, and re-themes live', async () => {
    const store = installFakeChrome();
    const handle = openOptions('light');
    await tick();

    const panel = handle.shadowRoot.querySelector('.sk-panel') as HTMLElement;
    expect(getComputedStyle(panel).backgroundColor).toBe('rgb(255, 255, 255)'); // light

    const select = handle.shadowRoot.querySelector(
      '[data-testid="sk-theme-select"]',
    ) as HTMLSelectElement;
    select.value = 'dark';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();

    // Persisted to storage…
    expect((await getSettings()).theme).toBe('dark');
    expect(store[SETTINGS_KEY]).toMatchObject({ theme: 'dark' });
    // …and the live panel re-resolved the dark tokens.
    expect(getComputedStyle(panel).backgroundColor).toBe('rgb(26, 26, 26)');

    handle.dispose();

    // Reopening shows the changed theme.
    const reopened = openOptions((await getSettings()).theme);
    const select2 = reopened.shadowRoot.querySelector(
      '[data-testid="sk-theme-select"]',
    ) as HTMLSelectElement;
    await waitFor(() => select2.value === 'dark');
    expect(select2.value).toBe('dark');
    reopened.dispose();
  });
});
