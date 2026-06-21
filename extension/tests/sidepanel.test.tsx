// Side-panel app coverage (happy-dom): the entrypoint root resolves the active
// tab's platform, mounts the SidebarShell (wired to the worker via messaging) on
// a supported host, falls back to a neutral prompt when no supported tab is
// active, and re-scopes when the active tab changes. Maps to the `side-panel`
// spec scenarios. A minimal `chrome` shim backs tabs + settings + messaging.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { SidePanelApp, resolveActivePlatform } from '../src/entrypoints/sidepanel/SidePanelApp';
import { SETTINGS_KEY } from '../src/core/settings';

// --- minimal chrome shim: tabs (active-tab URL + change events), storage.local
//     (settings), and runtime (worker messaging + openOptionsPage) -------------
type TabListener = () => void;
type ChangeListener = (
  changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
  areaName: string,
) => void;

function makeChrome(initialUrl: string | undefined, onboarded = true) {
  let activeUrl = initialUrl;
  const activated = new Set<TabListener>();
  const updated = new Set<TabListener>();
  // Seed onboarding as complete (by default) so these scenarios exercise the
  // platform branch (shell / empty / auto-close), not the first-run onboarding
  // surface. Pass `onboarded = false` to exercise the pre-onboarding fallback.
  // The onboarding gate itself is covered in onboarding-*.test.tsx.
  const store: Record<string, unknown> = { [SETTINGS_KEY]: { onboardingCompleted: onboarded } };
  const changeListeners = new Set<ChangeListener>();
  const sendMessage = vi.fn(async () => ({ ok: false, error: { code: 'no_response' } }));

  const fire = () => {
    for (const cb of activated) cb();
    for (const cb of updated) cb();
  };

  return {
    sendMessage,
    /** Simulate the user switching/navigating the active tab. */
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
let fake: ReturnType<typeof makeChrome>;
let container: HTMLElement;

function setChrome(c: unknown) {
  (globalThis as { chrome?: unknown }).chrome = c;
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const $ = (sel: string) => container.querySelector(sel) as HTMLElement | null;

async function mountPanel(): Promise<void> {
  render(<SidePanelApp />, container);
  // Let the chain settle: panel effect → tab query → re-render mounts the shell →
  // shell effects (settings hydrate + useWorkspace's worker query) fire.
  for (let i = 0; i < 6; i++) await flush();
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  render(null, container);
  document.body.innerHTML = '';
  setChrome(originalChrome);
});

describe('resolveActivePlatform (7.3)', () => {
  it('maps a supported active tab URL to its platform', async () => {
    setChrome(makeChrome('https://claude.ai/chat/abc').chrome);
    expect(await resolveActivePlatform()).toBe('claude');
  });

  it('returns null for an unsupported tab', async () => {
    setChrome(makeChrome('https://example.com/').chrome);
    expect(await resolveActivePlatform()).toBeNull();
  });

  it('returns null when no chrome.tabs is available', async () => {
    setChrome(undefined);
    expect(await resolveActivePlatform()).toBeNull();
  });
});

describe('Side panel mounts the shell on a supported host (7.2)', () => {
  it('renders the SidebarShell and wires worker messaging', async () => {
    fake = makeChrome('https://claude.ai/chat/abc');
    setChrome(fake.chrome);
    await mountPanel();

    // The shell is mounted (not the neutral prompt)…
    expect($('[data-testid=sk-shell]')).toBeTruthy();
    expect($('[data-testid=sk-panel-empty]')).toBeNull();
    expect(container.textContent).toContain('Personal workspace');
    // …and its data layer reached the worker over runtime messaging.
    expect(fake.sendMessage).toHaveBeenCalled();
  });
});

describe('Neutral state + re-scoping (7.3)', () => {
  it('shows the neutral prompt when no supported tab is active', async () => {
    fake = makeChrome('https://example.com/');
    setChrome(fake.chrome);
    await mountPanel();

    expect($('[data-testid=sk-panel-empty]')).toBeTruthy();
    expect($('[data-testid=sk-shell]')).toBeNull();
    expect(container.textContent).toContain('Open a supported chat');
  });

  it('re-scopes to the new platform when the active tab changes', async () => {
    fake = makeChrome('https://claude.ai/');
    setChrome(fake.chrome);
    await mountPanel();
    expect($('[data-testid=sk-shell]')).toBeTruthy();

    // Switch to an unsupported tab → neutral state.
    fake.setActiveUrl('https://example.com/');
    await flush();
    await flush();
    expect($('[data-testid=sk-panel-empty]')).toBeTruthy();
    expect($('[data-testid=sk-shell]')).toBeNull();

    // Switch to another supported tab → shell returns. (Only `claude` has a
    // bundled config today; a second claude tab still exercises re-scoping.)
    fake.setActiveUrl('https://claude.ai/new');
    await flush();
    await flush();
    expect($('[data-testid=sk-shell]')).toBeTruthy();
    expect($('[data-testid=sk-panel-empty]')).toBeNull();
  });
});

describe('Auto-close on an unsupported host (7.3)', () => {
  let close: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    // happy-dom's `window.close()` is a no-op; spy so we can assert the call
    // without it tearing down the test document.
    close = vi.spyOn(window, 'close').mockImplementation(() => {});
  });
  afterEach(() => close.mockRestore());

  it('closes the panel when the active tab switches to an unsupported host', async () => {
    fake = makeChrome('https://claude.ai/');
    setChrome(fake.chrome);
    await mountPanel();
    // Supported host resolved: the panel stays open.
    expect(close).not.toHaveBeenCalled();

    // First switch to an unsupported host closes it (not a switch late).
    fake.setActiveUrl('https://example.com/');
    await flush();
    await flush();
    expect(close).toHaveBeenCalled();
  });

  it('stays open on a supported host (never closes while resolving or scoped)', async () => {
    fake = makeChrome('https://claude.ai/chat/abc');
    setChrome(fake.chrome);
    await mountPanel();
    // Through the initial `undefined` (still resolving) and the resolved supported
    // platform, the strict `=== null` guard keeps `window.close` untouched.
    expect(close).not.toHaveBeenCalled();
    expect($('[data-testid=sk-shell]')).toBeTruthy();
  });

  it('does not close on an unsupported host before onboarding (first-run shows on any tab)', async () => {
    fake = makeChrome('https://example.com/', false); // onboarding NOT complete
    setChrome(fake.chrome);
    await mountPanel();
    // The platform-independent first-run flow must remain reachable everywhere.
    expect(close).not.toHaveBeenCalled();
  });
});
