// Conversation context menu in real Chromium — proves the per-row menu opens
// inside the shadow root (not the host light DOM), is keyboard-operable (roving
// focus + Enter), and dismisses on Escape restoring focus to the trigger. Maps to
// the "Conversation row context menu" scenarios (keyboard + ARIA) that happy-dom
// cannot fully exercise (Zag positioning / focus management need a real browser).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, type MountHandle } from '../../src/ui/mount';
import { SIDEBAR_CSS } from '../../src/ui/sidebar/styles';
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

function mountList() {
  const target = document.createElement('div');
  document.body.appendChild(target);
  handle = mount(
    target,
    <ConversationList
      conversations={[conv('a', { title: 'Alpha' })]}
      active={null}
      tree={TREE}
      mutate={async (op) => {
        ops.push(op);
        return { ok: true, applied: true };
      }}
      context={{ kind: 'folder', name: 'Work' }}
    />,
    { theme: 'light' },
  );
  const style = document.createElement('style');
  style.textContent = SIDEBAR_CSS;
  handle.shadowRoot.appendChild(style);
  return handle;
}

const $ = (sel: string) => handle!.shadowRoot.querySelector(sel) as HTMLElement | null;

function keydown(el: HTMLElement, key: string) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true }));
}

async function openMenu() {
  $('[data-testid=sk-conv-menu]')!.click();
  await vi.waitFor(() => expect($('[data-testid=sk-conv-context-menu]')).toBeTruthy());
}

afterEach(() => {
  handle?.dispose();
  handle = null;
  ops.length = 0;
  document.body.innerHTML = '';
});

describe('conversation context menu (real browser)', () => {
  it('opens inside the shadow root, not the host light DOM', async () => {
    mountList();
    await openMenu();
    expect($('[data-testid=sk-conv-context-menu]')).toBeTruthy();
    expect(document.body.querySelector('[data-testid=sk-conv-context-menu]')).toBeNull();
  });

  it('is keyboard operable: arrow keys move focus and Enter activates', async () => {
    mountList();
    await openMenu();
    const content = () => $('[data-testid=sk-conv-context-menu]')!;
    keydown(content(), 'ArrowDown'); // highlight first item (Move to folder)
    await vi.waitFor(() => expect(content().getAttribute('aria-activedescendant')).toBeTruthy());
    keydown(content(), 'ArrowDown'); // highlight second item (Pin to top)
    keydown(content(), 'Enter');
    await vi.waitFor(() =>
      expect(ops).toContainEqual({ op: 'conversation.pin', conversationId: 'a', pinned: true }),
    );
  });

  it('closes on Escape and restores focus to the trigger', async () => {
    mountList();
    await openMenu();
    keydown($('[data-testid=sk-conv-context-menu]')!, 'Escape');
    await vi.waitFor(() => expect($('[data-testid=sk-conv-context-menu]')).toBeNull());
    await vi.waitFor(() => expect(handle!.shadowRoot.activeElement).toBe($('[data-testid=sk-conv-menu]')));
  });
});
