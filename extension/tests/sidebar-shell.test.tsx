// SidebarShell coverage (happy-dom): the frame, the disabled feature stubs, and
// the settings wiring. Maps to the sidebar-shell spec requirements. The folder
// body is fed an injected `view` so these run without the worker; a minimal
// `chrome` shim backs settings + openOptionsPage.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { SidebarShell } from '../src/ui/sidebar/SidebarShell';
import type { WorkspaceView } from '../src/ui/sidebar/useWorkspace';
import type { ProfileLibraryView } from '../src/ui/profiles/useProfileLibrary';
import type { ConversationIndex } from '../src/shared/types';
import { SETTINGS_KEY } from '../src/shared/settings';

// A ready, empty profile-library stub so the Profiles tab deterministically renders its
// panel + first-run state (no worker round-trip under the test chrome shim).
const profileView: ProfileLibraryView = {
  profiles: [],
  status: 'ready',
  refresh: vi.fn(),
  retry: vi.fn(),
  mutate: vi.fn(async () => ({ ok: true, applied: true })),
};

const view: WorkspaceView = {
  tree: { active: [], pinned: [], archived: [] },
  conversations: [],
  active: null,
  listCollapsed: false,
  platformFilter: 'all',
  setPlatformFilter: vi.fn(),
  status: 'ready',
  refresh: vi.fn(),
  retry: vi.fn(),
  mutate: vi.fn(async () => ({ ok: true, applied: true })),
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
  render(<SidebarShell platform="claude" view={view} profileView={profileView} />, container);
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
    expect(container.textContent).toContain('Chats and prompts, one thread');
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
    expect(container.textContent).toContain('Chats and prompts, one thread');
    expect($('.sk-brand__status')).toBeTruthy();
  });
});

describe('Disabled feature stubs (6.2)', () => {
  it('Prompts and Profiles are now interactive; search live; local-only status present', async () => {
    await mountShell();
    const prompts = $('[data-testid=sk-tab-prompts]') as HTMLButtonElement;
    const profiles = $('[data-testid=sk-tab-profiles]') as HTMLButtonElement;
    // Search is now live (C8) — the launcher opens the overlay rather than being inert.
    const search = $('[data-testid=sk-search]') as HTMLButtonElement;
    expect(search.disabled).toBe(false);
    // The launcher advertises an OS-aware accelerator (⌘K on macOS, Ctrl+K elsewhere).
    expect(container.textContent).toMatch(/⌘K|Ctrl\+K/);
    // Prompts became interactive earlier; Profiles became interactive in this slice.
    expect(prompts.disabled).toBe(false);
    expect(profiles.disabled).toBe(false);
    // The footer states the honest local-first resting state — no tier badge, no
    // "Synced" stub (both over-promised; they return with billing + sync in M5).
    expect($('[data-testid=sk-pro-badge]')).toBeNull();
    expect($('[data-testid=sk-sync]')).toBeNull();
    expect($('[data-testid=sk-status]')).toBeTruthy();
    // the active Folders tab is not disabled
    expect(($('[data-testid=sk-tab-folders]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('Cmd/Ctrl+K opens the search overlay (the launcher accelerator now works)', async () => {
    await mountShell();
    expect($('[data-testid=sk-search-overlay]')).toBeNull();
    // Ctrl+K (Windows/Linux) — exactly one of meta/ctrl, no Alt/Shift.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    await flush();
    expect($('[data-testid=sk-search-overlay]')).toBeTruthy();
  });

  it('plain K (no modifier) does not open the search overlay', async () => {
    await mountShell();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', bubbles: true }));
    await flush();
    expect($('[data-testid=sk-search-overlay]')).toBeNull();
  });
});

describe('Tab switching folders ⇄ prompts (sidebar-shell, 6.6)', () => {
  it('Folders is selected by default and the folder body + filter chrome are shown', async () => {
    await mountShell();
    expect(($('[data-testid=sk-tab-folders]') as HTMLButtonElement).getAttribute('aria-selected')).toBe('true');
    expect($('[data-testid=sk-sidebar]')).toBeTruthy();
    expect($('[data-testid=sk-filters]')).toBeTruthy();
  });

  it('activating Prompts shows the prompt body and hides the folder filter/nudge', async () => {
    await mountShell();
    $('[data-testid=sk-tab-prompts]')!.click();
    await flush();
    const prompts = $('[data-testid=sk-tab-prompts]') as HTMLButtonElement;
    expect(prompts.getAttribute('aria-selected')).toBe('true');
    expect($('[data-testid=sk-prompts-panel]')).toBeTruthy();
    // The folder-specific platform filter row + folder body are gone.
    expect($('[data-testid=sk-filters]')).toBeNull();
    expect($('[data-testid=sk-sidebar]')).toBeNull();
  });

  it('switching back to Folders restores the folder body and its filter chrome', async () => {
    await mountShell();
    $('[data-testid=sk-tab-prompts]')!.click();
    await flush();
    $('[data-testid=sk-tab-folders]')!.click();
    await flush();
    expect(($('[data-testid=sk-tab-folders]') as HTMLButtonElement).getAttribute('aria-selected')).toBe('true');
    expect($('[data-testid=sk-sidebar]')).toBeTruthy();
    expect($('[data-testid=sk-filters]')).toBeTruthy();
    expect($('[data-testid=sk-prompts-panel]')).toBeNull();
  });

  it('activating Profiles renders ProfilesPanel (not PromptsPanel) and hides folder chrome', async () => {
    await mountShell();
    $('[data-testid=sk-tab-profiles]')!.click();
    await flush();
    const profiles = $('[data-testid=sk-tab-profiles]') as HTMLButtonElement;
    expect(profiles.getAttribute('aria-selected')).toBe('true');
    expect($('[data-testid=sk-profiles-panel]')).toBeTruthy();
    // Guards the ternary fall-through: Profiles must render its own panel, not Prompts.
    expect($('[data-testid=sk-prompts-panel]')).toBeNull();
    // Folder-specific chrome + body are gone.
    expect($('[data-testid=sk-filters]')).toBeNull();
    expect($('[data-testid=sk-sidebar]')).toBeNull();
  });

  it('switching Folders → Profiles → Folders restores the folder body', async () => {
    await mountShell();
    $('[data-testid=sk-tab-profiles]')!.click();
    await flush();
    expect($('[data-testid=sk-profiles-panel]')).toBeTruthy();

    $('[data-testid=sk-tab-folders]')!.click();
    await flush();
    expect(($('[data-testid=sk-tab-folders]') as HTMLButtonElement).getAttribute('aria-selected')).toBe('true');
    expect($('[data-testid=sk-sidebar]')).toBeTruthy();
    expect($('[data-testid=sk-filters]')).toBeTruthy();
    expect($('[data-testid=sk-profiles-panel]')).toBeNull();
  });
});

describe('Settings opens the options page (6.4)', () => {
  it('the footer gear opens the options page', async () => {
    await mountShell();
    $('[data-testid=sk-settings]')!.click();
    expect(fake.openOptionsPage).toHaveBeenCalledTimes(1);
  });
});

describe('Platform view-filter chip group (sidebar-shell / D28)', () => {
  function conv(platform: ConversationIndex['platform'], nativeId: string): ConversationIndex {
    return {
      id: `${platform}::${nativeId}`,
      platform,
      nativeId,
      title: nativeId,
      folderId: null,
      tags: [],
      indexedText: '',
      contentHash: '',
      updatedAt: 0,
    };
  }
  // A workspace spanning two platforms so the chip group offers both.
  const multiPlatform: WorkspaceView = {
    ...view,
    conversations: [conv('claude', 'c1'), conv('gemini', 'g1')],
  };

  async function mountWith(v: WorkspaceView): Promise<void> {
    render(<SidebarShell platform="claude" view={v} />, container);
    await flush();
  }

  it('renders the group with an accessible label, an "All" chip active by default, and one chip per present platform (5.4)', async () => {
    await mountWith(multiPlatform);
    const group = $('[data-testid=sk-platforms]')!;
    expect(group).toBeTruthy();
    expect(group.getAttribute('role')).toBe('group');
    expect(group.getAttribute('aria-label')).toBeTruthy();

    // "All" is active by default (the unified view).
    const all = $('[data-testid=sk-platform-all]') as HTMLButtonElement;
    expect(all.getAttribute('aria-pressed')).toBe('true');

    // One chip per platform present in the workspace — and each is a real <button>
    // (focusable / keyboard-activatable), not an inert stub.
    const claudeChip = $('[data-testid=sk-platform-claude]') as HTMLButtonElement;
    const geminiChip = $('[data-testid=sk-platform-gemini]') as HTMLButtonElement;
    expect(claudeChip.tagName).toBe('BUTTON');
    expect(geminiChip.tagName).toBe('BUTTON');
    expect(claudeChip.disabled).toBe(false);
    // A platform with no conversations gets no chip.
    expect($('[data-testid=sk-platform-perplexity]')).toBeNull();

    // Each platform chip leads with its brand logo; "All" stays neutral (no logo).
    expect(claudeChip.querySelector('.sk-chip__logo svg')).toBeTruthy();
    expect(geminiChip.querySelector('.sk-chip__logo svg')).toBeTruthy();
    expect(all.querySelector('.sk-chip__logo')).toBeNull();
  });

  it('clicking a platform chip narrows the filter; "All" restores the unified view (5.3 wiring)', async () => {
    const setPlatformFilter = vi.fn();
    await mountWith({ ...multiPlatform, setPlatformFilter });

    ($('[data-testid=sk-platform-gemini]') as HTMLButtonElement).click();
    expect(setPlatformFilter).toHaveBeenLastCalledWith('gemini');

    ($('[data-testid=sk-platform-all]') as HTMLButtonElement).click();
    expect(setPlatformFilter).toHaveBeenLastCalledWith('all');
  });

  it('reflects the active filter on the chips (the selected platform is pressed, "All" is not)', async () => {
    await mountWith({ ...multiPlatform, platformFilter: 'gemini' });
    expect(($('[data-testid=sk-platform-all]') as HTMLButtonElement).getAttribute('aria-pressed')).toBe('false');
    expect(($('[data-testid=sk-platform-gemini]') as HTMLButtonElement).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('Collapsed-list nudge (sidebar-shell)', () => {
  async function mountWith(v: WorkspaceView): Promise<void> {
    render(<SidebarShell platform="gemini" view={v} />, container);
    await flush();
  }

  it('shows a platform-named nudge when the active record flags a collapsed list', async () => {
    await mountWith({
      ...view,
      active: { platform: 'gemini', nativeId: 'g1', title: 'A chat', updatedAt: 0, listCollapsedHint: true },
    });
    const nudge = $('[data-testid=sk-collapsed-list-nudge]');
    expect(nudge).toBeTruthy();
    expect(nudge!.getAttribute('role')).toBe('status'); // announced, not alarming
    expect(nudge!.textContent).toContain('Gemini');
    expect(nudge!.querySelector('.sk-nudge__logo svg')).toBeTruthy();
  });

  it('shows the nudge from the platform signal even with no open conversation (home page)', async () => {
    // The new-chat/home page: no active conversation, but the platform reports its
    // list is collapsed — the nudge must still appear (the fresh-user case).
    await mountWith({ ...view, active: null, listCollapsed: true });
    const nudge = $('[data-testid=sk-collapsed-list-nudge]');
    expect(nudge).toBeTruthy();
    expect(nudge!.textContent).toContain('Gemini');
  });

  it('renders no nudge when no conversation is open and the list is not collapsed', async () => {
    await mountWith({ ...view, active: null, listCollapsed: false });
    expect($('[data-testid=sk-collapsed-list-nudge]')).toBeNull();
  });

  it('renders no nudge when the active conversation does not flag a collapsed list', async () => {
    await mountWith({
      ...view,
      active: { platform: 'gemini', nativeId: 'g1', title: 'A chat', updatedAt: 0 },
    });
    expect($('[data-testid=sk-collapsed-list-nudge]')).toBeNull();
  });
});

describe('Footer status is honest about local-first state', () => {
  it('shows a single "Local-only" status — no tier badge and no "Synced" stub', async () => {
    await mountShell();
    // The over-promising labels are gone (Pro isn't purchasable; sync ships M5).
    expect($('[data-testid=sk-pro-badge]')).toBeNull();
    expect($('[data-testid=sk-sync]')).toBeNull();

    const status = $('[data-testid=sk-status]')!;
    expect(status).toBeTruthy();
    expect(status.textContent).toContain('Local-only');
    // It's a status region (announced, not alarming) and carries a privacy tooltip.
    expect(status.getAttribute('role')).toBe('status');
    expect(status.getAttribute('title')).toMatch(/stays on this device/i);
    // Paired icon, not colour-only (a11y: color-not-only).
    expect(status.querySelector('svg')).toBeTruthy();
  });

  it('does not vary with the persisted tier (the badge was removed)', async () => {
    fake.store[SETTINGS_KEY] = { tier: 'FREE' };
    await mountShell();
    await flush();
    expect($('[data-testid=sk-status]')!.textContent).toContain('Local-only');
    expect($('[data-testid=sk-pro-badge]')).toBeNull();
  });
});
