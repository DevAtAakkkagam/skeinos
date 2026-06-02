// SidebarShell coverage (happy-dom): the frame, the disabled feature stubs, and
// the settings wiring. Maps to the sidebar-shell spec requirements. The folder
// body is fed an injected `view` so these run without the worker; a minimal
// `chrome` shim backs settings + openOptionsPage.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { SidebarShell } from '../src/ui/sidebar/SidebarShell';
import type { WorkspaceView } from '../src/ui/sidebar/useWorkspace';

const view: WorkspaceView = {
  tree: { active: [], pinned: [], archived: [] },
  counts: {},
  conversations: [],
  refresh: vi.fn(),
  mutate: vi.fn(async () => true),
};

// --- minimal chrome shim: storage.local (settings) + runtime (options + msg) ---
type ChangeListener = (
  changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
  areaName: string,
) => void;

function makeChrome(seed: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = { ...seed };
  const listeners = new Set<ChangeListener>();
  const openOptionsPage = vi.fn();
  return {
    store,
    openOptionsPage,
    chrome: {
      runtime: {
        openOptionsPage,
        sendMessage: async () => undefined,
        onMessage: { addListener: () => {}, removeListener: () => {} },
        lastError: undefined,
      },
      tabs: { query: async () => [], sendMessage: async () => {} },
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

async function mountShell(): Promise<void> {
  render(<SidebarShell platform="claude" view={view} />, container);
  await flush(); // let any effects + async folder view settle
}

beforeEach(() => {
  fake = makeChrome();
  setChrome(fake.chrome);
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  render(null, container);
  document.body.innerHTML = '';
  setChrome(originalChrome);
});

describe('Framed shell (6.1)', () => {
  it('renders header, tab strip, footer, and the folder body when expanded', async () => {
    await mountShell();
    expect($('[data-testid=sk-shell]')).toBeTruthy();
    expect(container.textContent).toContain('Personal workspace');
    expect($('[data-testid=sk-tab-folders]')).toBeTruthy();
    expect($('[data-testid=sk-settings]')).toBeTruthy();
    // the live folder body (with its empty-state) is mounted inside
    expect($('[data-testid=sk-sidebar]')).toBeTruthy();
    expect($('[data-testid=sk-folders-empty]')).toBeTruthy();
  });

  it('omits the app name/glyph (shown by the native side-panel title bar) and keeps the workspace label', async () => {
    await mountShell();
    // the expanded header no longer repeats the brand name or its glyph mark
    expect(container.textContent).not.toContain('SKEINOS');
    expect($('.sk-brand__mark')).toBeFalsy();
    expect($('.sk-brand__glyph')).toBeFalsy();
    // the live workspace label + presence dot stay
    expect(container.textContent).toContain('Personal workspace');
    expect($('.sk-brand__status')).toBeTruthy();
  });
});

describe('Disabled feature stubs (6.2)', () => {
  it('search, Prompts/Profiles tabs, PRO badge, and sync are present and inert', async () => {
    await mountShell();
    const search = $('[data-testid=sk-search]') as HTMLButtonElement;
    const prompts = $('[data-testid=sk-tab-prompts]') as HTMLButtonElement;
    const profiles = $('[data-testid=sk-tab-profiles]') as HTMLButtonElement;
    expect(search.disabled).toBe(true);
    expect(container.textContent).toContain('⌘K');
    expect(prompts.disabled).toBe(true);
    expect(prompts.getAttribute('aria-disabled')).toBe('true');
    expect(profiles.disabled).toBe(true);
    expect($('[data-testid=sk-pro-badge]')).toBeTruthy();
    expect($('[data-testid=sk-sync]')).toBeTruthy();
    // the active Folders tab is not disabled
    expect(($('[data-testid=sk-tab-folders]') as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('Settings opens the options page (6.4)', () => {
  it('the footer gear opens the options page', async () => {
    await mountShell();
    $('[data-testid=sk-settings]')!.click();
    expect(fake.openOptionsPage).toHaveBeenCalledTimes(1);
  });
});
