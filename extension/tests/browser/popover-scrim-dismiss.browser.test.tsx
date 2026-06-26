// Popover dismissal scrim in real Chromium — the held-press regression the prior
// synthetic-click unit test could not catch. With the conversation context menu open,
// a transparent scrim covers the rows; a press anywhere outside the menu physically
// lands on the scrim (proved via elementFromPoint), so it only dismisses — the row's
// open handler behind it never fires, even when the press is held across a frame so
// Zag's deferred interact-outside closes the menu before release. Maps to the
// "Non-modal popover outside-dismiss does not pass through" + "Dismissal survives a
// held press across a frame" scenarios.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, type MountHandle } from '../../src/ui/mount';
import { SIDEBAR_CSS } from '../../src/ui/sidebar/styles';
import { PRIMITIVES_CSS } from '../../src/ui/primitives';
import { ConversationList } from '../../src/ui/sidebar/ConversationList';
import type { ConversationIndex, Folder, FolderTreeNode } from '../../src/shared/types';
import type { FolderTreeSnapshot, MutationOp } from '../../src/shared/workspace';

function folder(id: string): Folder {
  return { id, name: id, parentId: null, platformScope: 'unified', order: 0, rev: 1, updatedAt: 0, deviceId: 'd', hash: 'h' };
}
const node = (f: Folder): FolderTreeNode => ({ folder: f, depth: 1, children: [] });
const TREE: FolderTreeSnapshot = { active: [node(folder('work'))], pinned: [], archived: [] };

function conv(id: string, over: Partial<ConversationIndex> = {}): ConversationIndex {
  return { id, platform: 'claude', nativeId: id, title: id, folderId: 'work', tags: [], indexedText: '', contentHash: '', updatedAt: 0, ...over };
}

let handle: MountHandle | null = null;
const ops: MutationOp[] = [];
const opened: string[] = [];

function mountList() {
  const target = document.createElement('div');
  document.body.appendChild(target);
  handle = mount(
    target,
    <ConversationList
      conversations={[conv('a', { title: 'Alpha' }), conv('b', { title: 'Beta' })]}
      active={null}
      tree={TREE}
      mutate={async (op) => {
        ops.push(op);
        return { ok: true, applied: true };
      }}
      context={{ kind: 'folder', name: 'Work' }}
      onOpen={(c) => opened.push(c.id)}
    />,
    { theme: 'light' },
  );
  for (const css of [SIDEBAR_CSS, PRIMITIVES_CSS]) {
    const style = document.createElement('style');
    style.textContent = css;
    handle.shadowRoot.appendChild(style);
  }
  return handle;
}

const $ = (sel: string) => handle!.shadowRoot.querySelector(sel) as HTMLElement | null;
const rAF = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

function pointerdown(el: Element) {
  el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
}

async function openMenu() {
  $('[data-testid=sk-conv-menu]')!.click();
  await vi.waitFor(() => expect($('[data-testid=sk-conv-context-menu]')).toBeTruthy());
}

afterEach(() => {
  handle?.dispose();
  handle = null;
  ops.length = 0;
  opened.length = 0;
  document.body.innerHTML = '';
});

describe('popover dismissal scrim (real browser)', () => {
  it('intercepts a press over the row: the scrim, not the row, is the hit target', async () => {
    mountList();
    await openMenu();
    // The first row's open button — the control that opens the conversation.
    const openBtn = $('[data-testid=sk-conv-open]')!;
    const r = openBtn.getBoundingClientRect();
    const hit = handle!.shadowRoot.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    // With the scrim present the press physically lands on it, never on the row.
    expect((hit as HTMLElement)?.dataset.testid).toBe('sk-conv-menu-scrim');
    expect(hit).not.toBe(openBtn);
  });

  it('a held outside press dismisses the menu without opening the conversation behind it', async () => {
    mountList();
    await openMenu();
    const openBtn = $('[data-testid=sk-conv-open]')!;
    const r = openBtn.getBoundingClientRect();
    const scrim = handle!.shadowRoot.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)!;
    expect((scrim as HTMLElement).dataset.testid).toBe('sk-conv-menu-scrim');

    // Press is HELD: pointerdown now, release a frame later. Zag's interact-outside is
    // rAF-deferred, so the menu closes mid-gesture — the timing the old synthetic
    // same-tick click never reached.
    pointerdown(scrim);
    await rAF();
    await rAF();
    await vi.waitFor(() => expect($('[data-testid=sk-conv-context-menu]')).toBeNull());

    // The conversation behind the dismissed menu was never opened.
    expect(opened).toEqual([]);
  });

  it('keeps menu items clickable above the scrim', async () => {
    mountList();
    await openMenu();
    ($('[data-testid=sk-conv-menu-pin]') as HTMLElement).click();
    await vi.waitFor(() =>
      expect(ops).toContainEqual({ op: 'conversation.pin', conversationId: 'a', pinned: true }),
    );
  });
});
