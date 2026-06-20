// onboarding-foundation side-panel router coverage (happy-dom). Maps to
// openspec/changes/onboarding-foundation/tasks.md §4.3–4.4:
//   4.3 — branch precedence: the onboarding surface sits ABOVE the platform
//         branch, so it shows with OR without a supported tab and never alongside
//         the empty/workspace branch; while unresolved nothing renders (no flash).
//   4.4 — live re-scope: the "Get started" action marks onboarding complete and
//         the panel leaves the surface without a reload; completion persists across
//         a reload.
//
// Mirrors tests/sidepanel.test.tsx's shim (tabs + storage + runtime messaging),
// but the storage `seed` is configurable so we can drive the onboarding gate.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { SidePanelApp } from '../src/entrypoints/sidepanel/SidePanelApp';
import { SETTINGS_KEY } from '../src/core/settings';

type TabListener = () => void;
type ChangeListener = (
  changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
  areaName: string,
) => void;

interface MakeChromeOpts {
  /** Initial storage.local contents. Lets a test seed the onboarding gate. */
  seed?: Record<string, unknown>;
  /** When true, storage.local.get never resolves — exercises the unresolved phase. */
  hangGet?: boolean;
}

function makeChrome(initialUrl: string | undefined, opts: MakeChromeOpts = {}) {
  let activeUrl = initialUrl;
  const activated = new Set<TabListener>();
  const updated = new Set<TabListener>();
  const store: Record<string, unknown> = { ...(opts.seed ?? {}) };
  const changeListeners = new Set<ChangeListener>();
  const sendMessage = vi.fn(async () => ({ ok: false, error: { code: 'no_response' } }));

  const fire = () => {
    for (const cb of activated) cb();
    for (const cb of updated) cb();
  };

  return {
    sendMessage,
    store,
    setActiveUrl(url: string | undefined) {
      activeUrl = url;
      fire();
    },
    chrome: {
      tabs: {
        query: async () => [{ url: activeUrl }],
        onActivated: {
          addListener: (cb: TabListener) => void activated.add(cb),
          removeListener: (cb: TabListener) => void activated.delete(cb),
        },
        onUpdated: {
          addListener: (cb: TabListener) => void updated.add(cb),
          removeListener: (cb: TabListener) => void updated.delete(cb),
        },
      },
      runtime: {
        openOptionsPage: vi.fn(),
        sendMessage,
        onMessage: { addListener: () => {}, removeListener: () => {} },
        lastError: undefined,
      },
      storage: {
        local: {
          async get(keys: string | string[] | null) {
            if (opts.hangGet) return new Promise<Record<string, unknown>>(() => {});
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
            for (const cb of changeListeners) cb(changes, 'local');
          },
        },
        onChanged: {
          addListener: (cb: ChangeListener) => void changeListeners.add(cb),
          removeListener: (cb: ChangeListener) => void changeListeners.delete(cb),
        },
      },
    },
  };
}

const originalChrome = (globalThis as { chrome?: unknown }).chrome;
let container: HTMLElement;

function setChrome(c: unknown) {
  (globalThis as { chrome?: unknown }).chrome = c;
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const $ = (sel: string) => container.querySelector(sel) as HTMLElement | null;

async function mountPanel(): Promise<void> {
  render(<SidePanelApp />, container);
  // Settle: panel effects → tab query + settings read → re-render → shell effects.
  for (let i = 0; i < 6; i++) await flush();
}

const SUPPORTED = 'https://claude.ai/chat/abc';
const onboardingDone = { [SETTINGS_KEY]: { onboardingCompleted: true } };

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  render(null, container);
  document.body.innerHTML = '';
  setChrome(originalChrome);
});

describe('Onboarding branch precedence (4.3)', () => {
  it('not complete + NO supported tab → onboarding, not empty/shell', async () => {
    setChrome(makeChrome('https://example.com/').chrome);
    await mountPanel();

    expect($('[data-testid=sk-onboarding]')).toBeTruthy();
    expect($('[data-testid=sk-panel-empty]')).toBeNull();
    expect($('[data-testid=sk-shell]')).toBeNull();
  });

  it('not complete + supported tab → onboarding still wins over the shell', async () => {
    setChrome(makeChrome(SUPPORTED).chrome);
    await mountPanel();

    expect($('[data-testid=sk-onboarding]')).toBeTruthy();
    expect($('[data-testid=sk-shell]')).toBeNull();
  });

  it('complete + supported tab → the workspace shell renders, not onboarding', async () => {
    const fake = makeChrome(SUPPORTED, { seed: onboardingDone });
    setChrome(fake.chrome);
    await mountPanel();

    expect($('[data-testid=sk-shell]')).toBeTruthy();
    expect($('[data-testid=sk-onboarding]')).toBeNull();
  });

  it('unresolved gate (settings read pending) → renders nothing (no flash)', async () => {
    // storage.local.get never resolves, so `onboarded` stays undefined and the
    // panel sits in its `return null` phase — neither onboarding nor empty/shell.
    setChrome(makeChrome(SUPPORTED, { hangGet: true }).chrome);
    await mountPanel();

    expect($('[data-testid=sk-onboarding]')).toBeNull();
    expect($('[data-testid=sk-panel-empty]')).toBeNull();
    expect($('[data-testid=sk-shell]')).toBeNull();
  });
});

describe('Live re-scope out of onboarding (4.4)', () => {
  it('completing onboarding leaves the surface without a reload, and persists across one', async () => {
    const fake = makeChrome(SUPPORTED); // not complete + supported tab
    setChrome(fake.chrome);
    await mountPanel();

    // First-run: onboarding surface, no shell.
    expect($('[data-testid=sk-onboarding]')).toBeTruthy();
    expect($('[data-testid=sk-shell]')).toBeNull();

    // Click "I already have an account" (the welcome skip) → completeOnboarding
    // writes onboardingCompleted: true, which broadcasts via storage.onChanged;
    // the subscribed panel re-scopes. (Under onboarding-flow's MODIFIED completion
    // requirement, "Get started" only advances the stepper — the welcome skip and
    // the final-step actions are the terminal completion triggers.)
    const btn = $('[data-testid=sk-onboarding-skip]');
    expect(btn).toBeTruthy();
    btn!.click();
    for (let i = 0; i < 6; i++) await flush();

    // …and the panel left onboarding for the shell WITHOUT a remount/reload.
    expect($('[data-testid=sk-onboarding]')).toBeNull();
    expect($('[data-testid=sk-shell]')).toBeTruthy();

    // Persistence across a reload: a fresh context over the same backing store.
    render(null, container);
    container = document.createElement('div');
    document.body.appendChild(container);
    setChrome(makeChrome(SUPPORTED, { seed: fake.store }).chrome);
    await mountPanel();

    expect($('[data-testid=sk-onboarding]')).toBeNull();
    expect($('[data-testid=sk-shell]')).toBeTruthy();
  });
});
