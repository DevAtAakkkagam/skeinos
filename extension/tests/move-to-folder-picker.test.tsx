// conversation-filing — the Move-to-folder picker (happy-dom). Renders the picker
// directly with a stub `onSubmit`/`onClose`, so it runs without the worker. Maps to
// "Move-to-folder picker is the keyboard-first filing primitive": filtering narrows
// the list, keyboard-only choosing files, unfiling assigns null, and the assignment
// is sent exactly once.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { MoveToFolderPicker, type PickerConversation } from '../src/ui/sidebar/MoveToFolderPicker';
import type { Folder, FolderTreeNode } from '../src/shared/types';
import type { FolderTreeSnapshot } from '../src/shared/workspace';

function folder(id: string, over: Partial<Folder> = {}): Folder {
  return {
    id,
    name: id,
    parentId: null,
    platformScope: 'unified',
    order: 0,
    rev: 1,
    updatedAt: 0,
    deviceId: 'd',
    hash: 'h',
    ...over,
  };
}
const node = (f: Folder, children: FolderTreeNode[] = []): FolderTreeNode => ({
  folder: f,
  depth: 1,
  children,
});

// Research (root) → with child Drafts; plus Work (root).
const TREE: FolderTreeSnapshot = {
  active: [
    node(folder('research', { name: 'Research' }), [
      node(folder('drafts', { name: 'Drafts', parentId: 'research' })),
    ]),
    node(folder('work', { name: 'Work' })),
  ],
  pinned: [],
  archived: [],
};

let container: HTMLElement | null = null;
function renderPicker(
  conversation: PickerConversation,
  onSubmit = vi.fn(async () => ({ ok: true, applied: true })),
  onClose = vi.fn(),
) {
  container = document.createElement('div');
  document.body.appendChild(container);
  render(
    <MoveToFolderPicker conversation={conversation} tree={TREE} onSubmit={onSubmit} onClose={onClose} />,
    container,
  );
  return { onSubmit, onClose };
}
const $ = (sel: string) => container!.querySelector(sel) as HTMLElement | null;
const $$ = (sel: string) => [...container!.querySelectorAll(sel)] as HTMLElement[];
const flush = async () => {
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
};
function typeFilter(value: string) {
  const input = $('[data-testid=sk-move-filter]') as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
function key(k: string) {
  ($('[data-testid=sk-move-filter]') as HTMLInputElement).dispatchEvent(
    new KeyboardEvent('keydown', { key: k, bubbles: true }),
  );
}

afterEach(() => {
  if (container) render(null, container);
  document.body.innerHTML = '';
  container = null;
});

const unfiled: PickerConversation = { id: 'claude::c1', title: 'A chat', folderId: null };
const filed: PickerConversation = { id: 'claude::c1', title: 'A chat', folderId: 'work' };

describe('MoveToFolderPicker filtering (2.1)', () => {
  it('lists every non-archived folder with parent breadcrumbs', async () => {
    renderPicker(unfiled);
    await flush();
    const opts = $$('[data-testid=sk-move-option]');
    expect(opts.map((o) => o.dataset.folderId)).toEqual(['research', 'drafts', 'work']);
    // The nested folder carries its parent breadcrumb for disambiguation.
    const drafts = opts.find((o) => o.dataset.folderId === 'drafts')!;
    expect(drafts.querySelector('.sk-picker__path')!.textContent).toContain('Research');
  });

  it('type-to-filter narrows the folder list', async () => {
    renderPicker(unfiled);
    await flush();
    typeFilter('dra');
    await flush();
    const opts = $$('[data-testid=sk-move-option]');
    expect(opts).toHaveLength(1);
    expect(opts[0].dataset.folderId).toBe('drafts');
  });

  it('shows a neutral no-matches state rather than nothing', async () => {
    renderPicker(unfiled);
    await flush();
    typeFilter('zzz');
    await flush();
    expect($('[data-testid=sk-move-empty]')).toBeTruthy();
    expect($$('[data-testid=sk-move-option]')).toHaveLength(0);
  });
});

describe('MoveToFolderPicker keyboard choosing (2.3, 2.4)', () => {
  it('arrow-to-navigate + Enter files the conversation with exactly one assign', async () => {
    const { onSubmit, onClose } = renderPicker(unfiled);
    await flush();
    // First option is Research; ArrowDown → Drafts; Enter confirms it.
    key('ArrowDown');
    await flush();
    key('Enter');
    await flush();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      op: 'conversation.assign',
      conversationId: 'claude::c1',
      folderId: 'drafts',
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('carries an ARIA-active descendant for the highlighted option', async () => {
    renderPicker(unfiled);
    await flush();
    const input = $('[data-testid=sk-move-filter]')!;
    const active = input.getAttribute('aria-activedescendant');
    expect(active).toBeTruthy();
    expect($(`#${active}`)!.getAttribute('aria-selected')).toBe('true');
  });
});

describe('MoveToFolderPicker unfiling (2.2)', () => {
  it('offers "Remove from folder" only when already filed, and it assigns null', async () => {
    const { onSubmit, onClose } = renderPicker(filed);
    await flush();
    const unfile = $('[data-testid=sk-move-unfile]');
    expect(unfile).toBeTruthy();
    unfile!.click();
    await flush();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      op: 'conversation.assign',
      conversationId: 'claude::c1',
      folderId: null,
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('hides the unfile choice when the conversation is not filed', async () => {
    renderPicker(unfiled);
    await flush();
    expect($('[data-testid=sk-move-unfile]')).toBeNull();
  });
});

describe('MoveToFolderPicker failure handling (2.4)', () => {
  it('keeps the picker open and surfaces an error when the assign does not take effect', async () => {
    const onSubmit = vi.fn(async () => ({ ok: false, applied: false }));
    const onClose = vi.fn();
    renderPicker(unfiled, onSubmit, onClose);
    await flush();
    $$('[data-testid=sk-move-option]')[0].click();
    await flush();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect($('[data-testid=sk-move-error]')).toBeTruthy();
  });
});
