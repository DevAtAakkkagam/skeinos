// Popover dismissal scrim — happy-dom coverage of the dismiss path on both non-modal
// surfaces (conversation context menu + tag picker). Pressing the scrim dismisses the
// surface; the underlying control's handler is not driven by that interaction; and the
// surface's own items stay reachable above the scrim. The real held-press hit-testing
// (the scrim physically intercepting the press) is exercised by the browser suite —
// here we assert the scrim exists, dismisses, and does not block the popover's items.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { ConversationList, type ConversationListContext } from '../src/ui/sidebar/ConversationList';
import { TagPicker } from '../src/ui/tags/TagPicker';
import type { ConversationIndex, Folder, FolderTreeNode, Tag } from '../src/shared/types';
import type { FolderTreeSnapshot, MutationOp } from '../src/shared/workspace';
import type { MutateResult } from '../src/ui/sidebar/useWorkspace';

function folder(id: string): Folder {
  return { id, name: id, parentId: null, platformScope: 'unified', order: 0, rev: 1, updatedAt: 0, deviceId: 'd', hash: 'h' };
}
const node = (f: Folder): FolderTreeNode => ({ folder: f, depth: 1, children: [] });
const TREE: FolderTreeSnapshot = { active: [node(folder('work'))], pinned: [], archived: [] };
const FOLDER_CTX: ConversationListContext = { kind: 'folder', name: 'Work' };

function conv(id: string, over: Partial<ConversationIndex> = {}): ConversationIndex {
  return { id, platform: 'claude', nativeId: id, title: id, folderId: 'work', tags: [], indexedText: '', contentHash: '', updatedAt: 0, ...over };
}
function tag(id: string, label = id): Tag {
  return { id, label, rev: 1, updatedAt: 0, deviceId: 'd', hash: 'h' };
}

let container: HTMLElement | null = null;
const $ = (sel: string) => container!.querySelector(sel) as HTMLElement | null;
const $$ = (sel: string) => [...container!.querySelectorAll(sel)] as HTMLElement[];
const flush = async () => {
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
};
const pointerdown = (el: Element) => el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

afterEach(() => {
  if (container) render(null, container);
  document.body.innerHTML = '';
  container = null;
});

describe('context-menu scrim (happy-dom)', () => {
  function mountList(onOpen = vi.fn(), mutate?: (op: MutationOp) => Promise<MutateResult>) {
    container = document.createElement('div');
    document.body.appendChild(container);
    render(
      <ConversationList
        conversations={[conv('a', { title: 'Alpha' })]}
        active={null}
        tree={TREE}
        mutate={mutate ?? (vi.fn(async () => ({ ok: true, applied: true })) as never)}
        context={FOLDER_CTX}
        onOpen={onOpen}
      />,
      container,
    );
    return onOpen;
  }
  const openMenu = async () => {
    $('[data-testid=sk-conv-menu]')!.click();
    await flush();
  };

  it('renders a scrim while the menu is open and removes it on dismiss', async () => {
    mountList();
    await openMenu();
    expect($('[data-testid=sk-conv-menu-scrim]')).toBeTruthy();
    pointerdown($('[data-testid=sk-conv-menu-scrim]')!);
    await flush();
    expect($('[data-testid=sk-conv-context-menu]')).toBeNull();
    expect($('[data-testid=sk-conv-menu-scrim]')).toBeNull();
  });

  it('pressing the scrim does not open the conversation behind it', async () => {
    const onOpen = mountList();
    await openMenu();
    pointerdown($('[data-testid=sk-conv-menu-scrim]')!);
    await flush();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('keeps menu items reachable above the scrim', async () => {
    const mutate = vi.fn(async () => ({ ok: true, applied: true }));
    mountList(vi.fn(), mutate);
    await openMenu();
    ($('[data-testid=sk-conv-menu-pin]') as HTMLElement).click();
    await flush();
    expect(mutate).toHaveBeenCalledWith({ op: 'conversation.pin', conversationId: 'a', pinned: true });
  });
});

describe('tag-picker scrim (happy-dom)', () => {
  function mountPicker(over: Partial<Parameters<typeof TagPicker>[0]> = {}) {
    container = document.createElement('div');
    document.body.appendChild(container);
    const anchor = document.createElement('button');
    container.appendChild(anchor);
    const props = {
      anchor,
      label: 'Tags',
      tags: [tag('t1', 'Research'), tag('t2', 'Personal')],
      selected: [] as string[],
      onToggle: vi.fn(),
      mutate: vi.fn(async () => ({ ok: true, applied: true })),
      onClose: vi.fn(),
      ...over,
    };
    render(<TagPicker {...props} />, container);
    return props;
  }

  it('renders a scrim and dismisses via it', async () => {
    const { onClose } = mountPicker();
    expect($('[data-testid=sk-tag-popover-scrim]')).toBeTruthy();
    pointerdown($('[data-testid=sk-tag-popover-scrim]')!);
    await flush();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('pressing the scrim does not toggle a tag', async () => {
    const { onToggle } = mountPicker();
    pointerdown($('[data-testid=sk-tag-popover-scrim]')!);
    await flush();
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('keeps tag toggles reachable above the scrim', async () => {
    const { onToggle } = mountPicker();
    const row = $$('[data-testid=sk-tag-opt]').find((r) => r.dataset.tagId === 't1')!;
    (row.querySelector('[data-testid=sk-tag-opt-t1]') as HTMLElement).click();
    await flush();
    expect(onToggle).toHaveBeenCalledWith('t1', true);
  });
});
