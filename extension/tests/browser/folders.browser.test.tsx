// folders E2E in real Chromium (Vitest browser mode / Playwright provider).
// Mounts the real Sidebar over the real worker handlers and a real IndexedDB,
// wired together by an in-page loopback that stands in for chrome messaging — so
// these exercise the genuine UI → message → single-writer → broadcast → re-render
// path. Maps to the "Sidebar tree with drag-drop and context menu" scenarios.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteDB } from 'idb';
import { mount, type MountHandle } from '../../src/ui/mount';
import { SIDEBAR_CSS } from '../../src/ui/sidebar/styles';
import { Sidebar } from '../../src/ui/sidebar/Sidebar';
import { dispatch } from '../../src/core/messaging';
import { isBroadcastWire, isRequestWire } from '../../src/core/messaging/wire';
import { __clearHandlers } from '../../src/core/messaging/registry';
import { registerFolderHandlers, mutateWorkspaceRemote } from '../../src/core/folders';
import { __resetWorkspaceStore, workspaceStore } from '../../src/core/store/instance';
import { DB_NAME } from '../../src/core/store/schema';

// --- in-page chrome loopback: client `send` → worker `dispatch`; worker
//     `broadcast` → client `subscribe` listeners (all in this one page) ---------
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
function mountSidebar(): MountHandle {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const h = mount(target, <Sidebar platform="claude" />, { theme: 'light' });
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

async function createFolder(name: string) {
  $('[data-testid=sk-new-folder]')!.click();
  await vi.waitFor(() => expect($('[data-testid=sk-folder-dialog]')).toBeTruthy());
  const input = $('[data-testid=sk-folder-name]') as HTMLInputElement;
  input.value = name;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  // Let Preact flush the controlled-input state update before submitting, so the
  // submit handler's closure sees the typed name rather than the empty initial one.
  await new Promise((r) => setTimeout(r, 0));
  $('[data-testid=sk-folder-submit]')!.click();
  await vi.waitFor(() =>
    expect($$('[data-testid=sk-folder]').some((r) => r.textContent?.includes(name))).toBe(true),
  );
}

function folderRow(name: string): HTMLElement {
  return $$('[data-testid=sk-folder]').find((r) => r.textContent?.includes(name))!;
}

beforeEach(async () => {
  __clearHandlers();
  await deleteDB(DB_NAME);
  installChrome();
  registerFolderHandlers();
  handle = mountSidebar();
  // Seed two host conversations through the worker. The sidebar no longer renders
  // an unfiled list (sidebar-shell), but the records back the folder counts and
  // remain valid drop payloads for assignment-by-drag onto a folder.
  await mutateWorkspaceRemote({
    op: 'conversation.ingest',
    platform: 'claude',
    refs: [{ nativeId: 'c1', title: 'First chat' }, { nativeId: 'c2', title: 'Second chat' }],
  });
  await vi.waitFor(() => expect($('[data-testid=sk-sidebar]')).toBeTruthy());
});

afterEach(async () => {
  handle?.dispose();
  handle = null;
  listeners.clear();
  document.body.innerHTML = '';
  // Close the worker's IndexedDB connection so the next test's deleteDB doesn't
  // block, then drop the cached handle so it reopens fresh.
  const store = await workspaceStore().catch(() => null);
  store?.db.close();
  __resetWorkspaceStore();
});

describe('folders sidebar (real browser)', () => {
  it('creates a folder via the dialog and drags a conversation into it', async () => {
    await createFolder('Research');
    const row = folderRow('Research');
    expect(row.querySelector('[data-testid=sk-folder-count]')!.textContent).toBe('0');

    fireDrop(row, { type: 'conversation', id: 'claude::c1' });

    // The folder count rises to 1: the dropped conversation is assigned even
    // though the sidebar renders no standalone conversation list.
    await vi.waitFor(() => {
      expect(folderRow('Research').querySelector('[data-testid=sk-folder-count]')!.textContent).toBe('1');
    });
  });

  it('pins and archives a folder from the context menu', async () => {
    await createFolder('Work');
    folderRow('Work').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    await vi.waitFor(() => expect($('[data-testid=sk-context-menu]')).toBeTruthy());
    $('[data-testid=sk-menu-pin]')!.click();
    await vi.waitFor(() => expect($('[data-testid=sk-pinned]')?.textContent).toContain('Work'));

    folderRow('Work').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    await vi.waitFor(() => expect($('[data-testid=sk-context-menu]')).toBeTruthy());
    $('[data-testid=sk-menu-archive]')!.click();
    await vi.waitFor(() => expect($('[data-testid=sk-archive]')?.textContent).toContain('Work'));
  });

  it('persists folders, assignment, and counts across a reload', async () => {
    await createFolder('Keep');
    fireDrop(folderRow('Keep'), { type: 'conversation', id: 'claude::c1' });
    await vi.waitFor(() =>
      expect(folderRow('Keep').querySelector('[data-testid=sk-folder-count]')!.textContent).toBe('1'),
    );

    // "Reload" the overlay: dispose and re-mount against the same IndexedDB.
    handle!.dispose();
    handle = mountSidebar();

    await vi.waitFor(() => {
      const row = folderRow('Keep');
      expect(row).toBeTruthy();
      expect(row.querySelector('[data-testid=sk-folder-count]')!.textContent).toBe('1');
    });
  });

  it('rejects a cyclic move and leaves the tree unchanged', async () => {
    await createFolder('Parent');
    await createFolder('Child');
    // Nest Child under Parent (valid move).
    fireDrop(folderRow('Parent'), { type: 'folder', id: folderRow('Child').dataset.folderId! });
    await vi.waitFor(() => {
      const parent = folderRow('Parent');
      // Child now renders as a descendant block following Parent's row.
      expect(parent.parentElement!.textContent).toContain('Child');
    });

    const parentId = folderRow('Parent').dataset.folderId!;
    // Attempt the cycle: move Parent under Child — must be rejected, tree unchanged.
    fireDrop(folderRow('Child'), { type: 'folder', id: parentId });

    // Give the rejected round-trip time to settle, then assert Parent is still a
    // top-level row (depth 1 → no left indent) — it did not move under Child.
    await new Promise((r) => setTimeout(r, 50));
    const parentBlock = folderRow('Parent').parentElement as HTMLElement;
    expect(parentBlock.style.marginLeft === '' || parentBlock.style.marginLeft === '0px').toBe(true);
  });
});
