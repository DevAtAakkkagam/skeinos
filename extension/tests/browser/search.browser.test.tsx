// search E2E in real Chromium (Vitest browser mode / Playwright provider).
// Mounts the real SidebarShell (which frames the SearchOverlay) over the real
// search/index + folder worker handlers and a real IndexedDB, wired by an in-page
// loopback that stands in for chrome messaging — so these exercise the genuine
// UI → message → single-writer (index + query) → broadcast → re-render path.
//
// Maps to the search E2E tasks:
//   6.1 index fixture conversations, then a keyboard-only search returns
//       highlighted results (ArrowDown moves selection; Enter/Escape behave);
//   6.2 a filtered query (platform / folder / date) constrains the rendered
//       results, and a no-match query shows the empty state.

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
import { __resetWorkspaceStore, workspaceStore } from '../../src/core/store/instance';
import { DB_NAME } from '../../src/core/store/schema';
import { conversationId } from '../../src/shared/workspace';
import type { IndexInput } from '../../src/shared/types';

// --- in-page chrome loopback (same shape as folders.browser / conversation-filing).
//     client `send` → worker `dispatch`; worker `broadcast` → client `subscribe`.
//     `tabs.query` returns a tab without a `url`, so opening a result is a safe
//     no-op (openConversation bails without a resolvable active-tab URL) — that
//     stubs the open side-effect without a navigation, exactly the tests' intent. --
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

const T_RECENT = Date.UTC(2026, 5, 15); // 2026-06-15
const T_OLD = Date.UTC(2026, 0, 10); // 2026-01-10

// Three fixture conversations on two platforms. Distinct vocabulary so a query
// targets a known subset; shared "report" term lets the folder/platform filters do
// the narrowing rather than the query.
const FIXTURES: IndexInput[] = [
  {
    id: conversationId('claude', 'c1'),
    platform: 'claude',
    nativeId: 'c1',
    title: 'Quarterly budget report',
    body: 'The quarterly budget report covers revenue forecasts and spreadsheet projections.',
    updatedAt: T_RECENT,
  },
  {
    id: conversationId('claude', 'c2'),
    platform: 'claude',
    nativeId: 'c2',
    title: 'Garden planting schedule',
    body: 'A planting schedule for tomatoes and basil through the summer report.',
    updatedAt: T_OLD,
  },
  {
    id: conversationId('gemini', 'g1'),
    platform: 'gemini',
    nativeId: 'g1',
    title: 'Travel itinerary report',
    body: 'A travel itinerary report for the budget conscious backpacker.',
    updatedAt: T_RECENT,
  },
];

/** Seed the workspace and the search index through the real handlers: ingest the
 *  refs (so they appear in the folder tree / counts) then bulk-index their content. */
async function seed(): Promise<void> {
  await mutateWorkspaceRemote({
    op: 'conversation.ingest',
    platform: 'claude',
    refs: FIXTURES.filter((f) => f.platform === 'claude').map((f) => ({ nativeId: f.nativeId, title: f.title })),
  });
  await mutateWorkspaceRemote({
    op: 'conversation.ingest',
    platform: 'gemini',
    refs: FIXTURES.filter((f) => f.platform === 'gemini').map((f) => ({ nativeId: f.nativeId, title: f.title })),
  });
  const res = await indexBulkRemote(FIXTURES);
  expect(res.ok).toBe(true);
}

const overlay = () => $('[data-testid=sk-search-overlay]');
const input = () => $('[data-testid=sk-search-input]') as HTMLInputElement;
const results = () => $$('[data-testid=sk-search-result]');
const resultTitles = () =>
  results().map((r) => r.querySelector('.sk-sr__title')?.textContent ?? '');

async function openOverlay(): Promise<void> {
  $('[data-testid=sk-search]')!.click();
  await vi.waitFor(() => expect(overlay()).toBeTruthy());
  await vi.waitFor(() => expect(handle!.shadowRoot.activeElement).toBe(input()));
}

/** Type into the focused input as a controlled field, then let the ~160ms debounce
 *  fire and the worker round-trip resolve. */
async function typeQuery(text: string): Promise<void> {
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

describe('search overlay (real browser)', () => {
  it('returns highlighted results for a keyboard-only query, with ArrowDown selection and Enter/Escape (6.1)', async () => {
    await seed();
    handle = mountShell();
    await vi.waitFor(() => expect($('[data-testid=sk-shell]')).toBeTruthy());

    await openOverlay();
    // "budget" matches c1 (title+body) and g1 (body) but not the garden chat.
    await typeQuery('budget');

    await vi.waitFor(() => {
      const titles = resultTitles();
      expect(titles).toContain('Quarterly budget report');
      expect(titles).toContain('Travel itinerary report');
      expect(titles).not.toContain('Garden planting schedule');
    });

    // The matched token is highlighted with <mark class="sk-sr__hit"> in the snippet.
    const marks = [...handle.shadowRoot.querySelectorAll('mark.sk-sr__hit')] as HTMLElement[];
    expect(marks.length).toBeGreaterThan(0);
    expect(marks.some((m) => m.textContent?.toLowerCase().includes('budget'))).toBe(true);

    // Selection starts on the first row (aria-selected + sk-sr--active).
    const rows = results();
    expect(rows[0].getAttribute('aria-selected')).toBe('true');
    expect(rows[0].classList.contains('sk-sr--active')).toBe(true);

    // ArrowDown moves the active descendant to the second row.
    press('ArrowDown');
    await vi.waitFor(() => {
      const r = results();
      expect(r[1].getAttribute('aria-selected')).toBe('true');
      expect(r[1].classList.contains('sk-sr--active')).toBe(true);
      expect(r[0].getAttribute('aria-selected')).toBe('false');
    });
    // aria-activedescendant on the combobox tracks the active row.
    expect(input().getAttribute('aria-activedescendant')).toBe('sk-sr-1');

    // Enter activates the selected row → openConversation (a no-op here: the stub
    // tab has no resolvable URL) and closes the overlay.
    press('Enter');
    await vi.waitFor(() => expect(overlay()).toBeNull());

    // Re-open and confirm Escape also closes it from the keyboard.
    await openOverlay();
    await typeQuery('budget');
    await vi.waitFor(() => expect(results().length).toBeGreaterThan(0));
    press('Escape');
    await vi.waitFor(() => expect(overlay()).toBeNull());
  });

  it('constrains results by platform / folder / date filters, and shows the empty state for a no-match query (6.2)', async () => {
    await seed();
    // File the Claude budget conversation into a folder so the folder filter has a
    // real target offered in the overlay's folder dropdown.
    await mutateWorkspaceRemote({ op: 'folder.create', id: 'finance', name: 'Finance', platformScope: 'claude' });
    await mutateWorkspaceRemote({
      op: 'conversation.assign',
      conversationId: conversationId('claude', 'c1'),
      folderId: 'finance',
    });

    handle = mountShell();
    await vi.waitFor(() => expect($('[data-testid=sk-shell]')).toBeTruthy());
    await openOverlay();

    // Baseline: "report" matches all three conversations across both platforms.
    await typeQuery('report');
    await vi.waitFor(() => expect(results().length).toBe(3));

    // --- Platform filter: narrow to Gemini only → just the travel itinerary. ----
    const platformSel = $('[data-testid=sk-filter-platform]') as HTMLSelectElement;
    platformSel.value = 'gemini';
    platformSel.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => {
      expect(resultTitles()).toEqual(['Travel itinerary report']);
    });
    // Clear the platform filter back to all.
    platformSel.value = '';
    platformSel.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(results().length).toBe(3));

    // --- Folder filter: narrow to Finance → only the filed budget report. -------
    const folderSel = $('[data-testid=sk-filter-folder]') as HTMLSelectElement;
    expect([...folderSel.options].some((o) => o.textContent === 'Finance')).toBe(true);
    folderSel.value = 'finance';
    folderSel.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => {
      expect(resultTitles()).toEqual(['Quarterly budget report']);
    });
    folderSel.value = '';
    folderSel.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(results().length).toBe(3));

    // --- Date filter: "updated after" mid-March drops the old garden chat. ------
    const fromInput = $('[data-testid=sk-filter-from]') as HTMLInputElement;
    fromInput.value = '2026-03-01';
    fromInput.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() => {
      const titles = resultTitles();
      expect(titles).toContain('Quarterly budget report');
      expect(titles).toContain('Travel itinerary report');
      expect(titles).not.toContain('Garden planting schedule');
    });
    fromInput.value = '';
    fromInput.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() => expect(results().length).toBe(3));

    // --- Empty state: a query no conversation matches shows sk-search-empty -----
    //     rather than a bare empty listbox.
    await typeQuery('xylophonezzz');
    await vi.waitFor(() => {
      expect($('[data-testid=sk-search-empty]')).toBeTruthy();
      expect(results().length).toBe(0);
    });
  });
});
