// prompt-search → navigation E2E in real Chromium (Vitest browser mode / Playwright).
//
// TARGETS THE UNIMPLEMENTED `prompt-search-results` CHANGE — this is a TDD/red test
// and is EXPECTED TO FAIL until `/opsx:apply prompt-search-results` adds the worker
// `prompt.search` selector, the `usePromptSearch` hook, the SearchOverlay prompts group
// + `onOpenPrompt` prop, and the SidebarShell wiring
// (`onOpenPrompt={(id) => { setActiveTab('prompts'); setPendingPromptId(id); setSearchOpen(false); }}`).
//
// Maps to tasks.md §4.3 + specs/search/spec.md "Selecting a prompt navigates to the
// Prompts tab": a keyboard-only pass — type a query, navigate to a prompt result,
// select it, and assert the panel switched to the Prompts tab with that prompt open.
//
// Mirrors search.browser.test.tsx setup precisely: the real SidebarShell over the real
// worker handlers (search/index + folders + prompts) and a real IndexedDB, wired by an
// in-page loopback standing in for chrome messaging.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteDB } from 'idb';
import { mount, type MountHandle } from '../../src/ui/mount';
import { SIDEBAR_CSS } from '../../src/ui/sidebar/styles';
import { SidebarShell } from '../../src/ui/sidebar/SidebarShell';
import { dispatch } from '../../src/core/messaging';
import { isBroadcastWire, isRequestWire } from '../../src/core/messaging/wire';
import { __clearHandlers } from '../../src/core/messaging/registry';
import { registerFolderHandlers, mutateWorkspaceRemote } from '../../src/core/folders';
import { registerSearchHandlers, indexBulkRemote } from '../../src/core/conversation-index';
import { registerPromptHandlers, mutatePromptLibraryRemote } from '../../src/core/prompts';
import { __resetWorkspaceStore, workspaceStore } from '../../src/core/store/instance';
import { DB_NAME } from '../../src/core/store/schema';
import { conversationId } from '../../src/shared/workspace';
import type { IndexInput } from '../../src/shared/types';

// --- in-page chrome loopback (identical to search.browser / prompts.browser). --
type Listener = (msg: unknown, sender: unknown, sendResponse: (r: unknown) => void) => unknown;
const listeners = new Set<Listener>();
function installChrome() {
  (globalThis as { chrome?: unknown }).chrome = {
    runtime: {
      onMessage: {
        addListener: (l: Listener) => void listeners.add(l),
        removeListener: (l: Listener) => void listeners.delete(l),
      },
      sendMessage: async (msg: unknown) =>
        isRequestWire(msg) ? await dispatch(msg.payload) : undefined,
      lastError: undefined,
      openOptionsPage: () => {},
    },
    tabs: {
      query: async () => [{ id: 1 }],
      sendMessage: async (_id: number, msg: unknown) => {
        if (isBroadcastWire(msg)) for (const l of [...listeners]) l(msg, {}, () => {});
      },
    },
  };
}

let handle: MountHandle | null = null;
function mountShell(): MountHandle {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const h = mount(target, <SidebarShell platform="claude" />, { theme: 'light' });
  const style = document.createElement('style');
  style.textContent = SIDEBAR_CSS;
  h.shadowRoot.appendChild(style);
  return h;
}

const $ = (sel: string) => handle!.shadowRoot.querySelector(sel) as HTMLElement | null;
const $$ = (sel: string) => [...handle!.shadowRoot.querySelectorAll(sel)] as HTMLElement[];

const T_RECENT = Date.UTC(2026, 5, 15);

// One conversation (so the conversations group is also populated) and one prompt that
// share the query term "kestrel", so the same query surfaces both groups.
const CONV: IndexInput = {
  id: conversationId('claude', 'c1'),
  platform: 'claude',
  nativeId: 'c1',
  title: 'Kestrel field notes',
  body: 'Observations of a kestrel over the meadow.',
  updatedAt: T_RECENT,
};

const PROMPT_ID = 'prompt-kestrel';
const PROMPT_TITLE = 'Kestrel briefing prompt';

async function seed(): Promise<void> {
  await mutateWorkspaceRemote({
    op: 'conversation.ingest',
    platform: 'claude',
    refs: [{ nativeId: CONV.nativeId, title: CONV.title }],
  });
  const idx = await indexBulkRemote([CONV]);
  expect(idx.ok).toBe(true);

  const created = await mutatePromptLibraryRemote({
    op: 'prompt.create',
    id: PROMPT_ID,
    title: PROMPT_TITLE,
    body: 'Brief me on the kestrel sighting.',
    targetModels: ['claude'],
  });
  expect(created.ok).toBe(true);
}

const overlay = () => $('[data-testid=sk-search-overlay]');
const input = () => $('[data-testid=sk-search-input]') as HTMLInputElement;
const rows = () => $$('[role=option]');

async function openOverlay(): Promise<void> {
  $('[data-testid=sk-search]')!.click();
  await vi.waitFor(() => expect(overlay()).toBeTruthy());
  await vi.waitFor(() => expect(handle!.shadowRoot.activeElement).toBe(input()));
}

function typeQuery(text: string): void {
  const el = input();
  el.value = text;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function press(key: string): void {
  input().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

beforeEach(async () => {
  __clearHandlers();
  await deleteDB(DB_NAME);
  installChrome();
  registerFolderHandlers();
  registerSearchHandlers();
  registerPromptHandlers();
});

afterEach(async () => {
  handle?.dispose();
  handle = null;
  listeners.clear();
  document.body.innerHTML = '';
  const store = await workspaceStore().catch(() => null);
  store?.db.close();
  __resetWorkspaceStore();
});

describe('search → prompt navigation (real browser, 4.3)', () => {
  it('keyboard-only: a prompt result navigates to the Prompts tab with that prompt open', async () => {
    await seed();
    handle = mountShell();
    await vi.waitFor(() => expect($('[data-testid=sk-shell]')).toBeTruthy());

    // The shell starts on the Folders tab.
    expect($('[data-testid=sk-tab-folders]')!.getAttribute('aria-selected')).toBe('true');

    await openOverlay();
    typeQuery('kestrel');

    // Both groups populate: at least one conversation row and the prompt row.
    await vi.waitFor(() => {
      const headers = $$('[data-testid=sk-search-group-header]').map((h) => h.textContent ?? '');
      expect(headers.some((t) => /prompt/i.test(t))).toBe(true);
      expect(rows().length).toBeGreaterThanOrEqual(2);
    });

    // Walk the unified listbox down to the prompt row (it carries the prompt's title).
    await vi.waitFor(() => {
      const promptRow = rows().find((r) => (r.textContent ?? '').includes(PROMPT_TITLE));
      expect(promptRow).toBeTruthy();
    });
    // Move selection until the active row is the prompt row, then Enter.
    const isPromptActive = () => {
      const active = rows().find((r) => r.getAttribute('aria-selected') === 'true');
      return !!active && (active.textContent ?? '').includes(PROMPT_TITLE);
    };
    for (let i = 0; i < rows().length && !isPromptActive(); i++) {
      press('ArrowDown');
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(isPromptActive()).toBe(true);
    press('Enter');

    // The overlay dismisses, the Prompts tab is now active, and the editor opened for
    // the navigated prompt (no host tab was opened — the stub tab has no URL).
    await vi.waitFor(() => expect(overlay()).toBeNull());
    await vi.waitFor(() => {
      expect($('[data-testid=sk-tab-prompts]')!.getAttribute('aria-selected')).toBe('true');
      expect($('[data-testid=sk-prompts-panel]')).toBeTruthy();
    });
    await vi.waitFor(() => {
      const titleInput = $('[data-testid=sk-prompt-editor-title]') as HTMLInputElement | null;
      expect(titleInput).toBeTruthy();
      expect(titleInput!.value).toBe(PROMPT_TITLE);
    });
  });
});
