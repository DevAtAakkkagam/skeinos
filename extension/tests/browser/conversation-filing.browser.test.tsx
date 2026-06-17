// conversation-filing E2E in real Chromium (Vitest browser mode / Playwright).
// Mounts the real SidebarShell over the real worker handlers and a real IndexedDB,
// wired by an in-page loopback that stands in for chrome messaging — so these
// exercise the genuine UI → message → single-writer → broadcast → re-render path
// for filing. Maps to the conversation-filing E2E tasks (5.1 card→picker keyboard
// filing survives reload; 5.2 drag a list row onto a folder, persisted).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteDB } from 'idb';
import { mount, type MountHandle } from '../../src/ui/mount';
import { SIDEBAR_CSS } from '../../src/ui/sidebar/styles';
import { SidebarShell } from '../../src/ui/sidebar/SidebarShell';
import { dispatch } from '../../src/core/messaging';
import { isBroadcastWire, isRequestWire } from '../../src/core/messaging/wire';
import { __clearHandlers } from '../../src/core/messaging/registry';
import { registerFolderHandlers, mutateWorkspaceRemote } from '../../src/core/folders';
import { __resetWorkspaceStore, workspaceStore } from '../../src/core/store/instance';
import { DB_NAME } from '../../src/core/store/schema';

// --- in-page chrome loopback (same shape as folders.browser) -----------------
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

function fireDrop(el: HTMLElement, payload: { type: string; id: string }) {
  const dt = new DataTransfer();
  dt.setData('application/x-skeinos', JSON.stringify(payload));
  const ev = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'dataTransfer', { value: dt });
  el.dispatchEvent(ev);
}

function folderRow(name: string): HTMLElement {
  return $$('[data-testid=sk-folder]').find((r) => r.textContent?.includes(name))!;
}

beforeEach(async () => {
  __clearHandlers();
  await deleteDB(DB_NAME);
  installChrome();
  registerFolderHandlers();
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

const activeRow = () =>
  $$('[data-testid=sk-conv-row]').find((r) => r.getAttribute('aria-current') === 'true') ?? null;

describe('conversation filing (real browser)', () => {
  it('auto-reveals the active conversation, files it keyboard-only via the row picker, persisting across reload (5.1)', async () => {
    // Seed: a folder, an ingested conversation, and the active-conversation report.
    await mutateWorkspaceRemote({ op: 'folder.create', id: 'research', name: 'Research', platformScope: 'claude' });
    await mutateWorkspaceRemote({
      op: 'conversation.ingest',
      platform: 'claude',
      refs: [{ nativeId: 'c1', title: 'First chat' }],
    });
    await mutateWorkspaceRemote({
      op: 'conversation.reportActive',
      platform: 'claude',
      nativeId: 'c1',
      title: 'First chat',
    });

    handle = mountShell();
    // The active (unfiled) conversation auto-expands under the Unfiled node and is
    // highlighted (aria-current) — no separate "current conversation" card.
    await vi.waitFor(() =>
      expect(activeRow()?.querySelector('[data-testid=sk-conv-title]')?.textContent).toBe('First chat'),
    );

    // Open the row's context menu, choose Move to…, then pick the only folder with
    // the keyboard alone.
    (activeRow()!.querySelector('[data-testid=sk-conv-menu]') as HTMLElement).click();
    await vi.waitFor(() => expect($('[data-testid=sk-conv-menu-move]')).toBeTruthy());
    $('[data-testid=sk-conv-menu-move]')!.click();
    await vi.waitFor(() => expect($('[data-testid=sk-move-picker]')).toBeTruthy());
    const filter = $('[data-testid=sk-move-filter]') as HTMLInputElement;
    filter.focus();
    filter.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    // After reconciling the conversation is filed in Research (its count bumps)…
    await vi.waitFor(() =>
      expect(folderRow('Research').querySelector('[data-testid=sk-folder-count]')!.textContent).toBe('1'),
    );

    // …and the assignment survives a reload (re-mount, same DB).
    handle.dispose();
    handle = mountShell();
    await vi.waitFor(() =>
      expect(folderRow('Research').querySelector('[data-testid=sk-folder-count]')!.textContent).toBe('1'),
    );
  });

  it('files a list-row conversation by expanding Unfiled and dragging it onto a folder, persisting across reload (5.2)', async () => {
    await mutateWorkspaceRemote({ op: 'folder.create', id: 'keep', name: 'Keep', platformScope: 'claude' });
    await mutateWorkspaceRemote({
      op: 'conversation.ingest',
      platform: 'claude',
      refs: [{ nativeId: 'c1', title: 'First chat' }, { nativeId: 'c2', title: 'Second chat' }],
    });

    handle = mountShell();
    // The conversations are unfiled — expand the Unfiled node to reveal their rows.
    await vi.waitFor(() => expect($('[data-testid=sk-unfiled-caret]')).toBeTruthy());
    ($('[data-testid=sk-unfiled-caret]') as HTMLElement).click();
    await vi.waitFor(() =>
      expect($$('[data-testid=sk-conv-row]').some((r) => r.dataset.conversationId === 'claude::c1')).toBe(true),
    );
    expect(folderRow('Keep').querySelector('[data-testid=sk-folder-count]')!.textContent).toBe('0');

    // Drag the first conversation row onto the Keep folder node (same document).
    fireDrop(folderRow('Keep'), { type: 'conversation', id: 'claude::c1' });

    await vi.waitFor(() =>
      expect(folderRow('Keep').querySelector('[data-testid=sk-folder-count]')!.textContent).toBe('1'),
    );

    // The assignment persists across a reload.
    handle.dispose();
    handle = mountShell();
    await vi.waitFor(() =>
      expect(folderRow('Keep').querySelector('[data-testid=sk-folder-count]')!.textContent).toBe('1'),
    );
  });
});
