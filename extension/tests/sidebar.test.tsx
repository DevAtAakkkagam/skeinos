// Sidebar folder-body coverage (happy-dom) using the injectable `view` seam, so
// these run without the worker or IndexedDB. Maps to the sidebar-shell empty-state
// requirement and the folders delta (pinned/archive rows show icon · color · count).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { Sidebar, FOLDER_ICON_SENTINEL } from '../src/ui/sidebar/Sidebar';
import type { WorkspaceView } from '../src/ui/sidebar/useWorkspace';
import type { ActiveConversation, ConversationIndex, Folder, FolderTreeNode } from '../src/shared/types';
import { conversationId, type FolderTreeSnapshot } from '../src/shared/workspace';

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
const node = (f: Folder, children: FolderTreeNode[] = []): FolderTreeNode => ({ folder: f, depth: 1, children });
function conv(id: string, over: Partial<ConversationIndex> = {}): ConversationIndex {
  return { id, platform: 'claude', nativeId: id, title: id, folderId: null, tags: [], indexedText: '', contentHash: '', updatedAt: 0, ...over };
}

// Counts are derived client-side from `conversations` now (folder.counts retired),
// so the 2nd positional arg is accepted-but-ignored to keep existing call sites
// terse; tests that assert a badge supply the backing conversations via `over`.
function makeView(
  tree: FolderTreeSnapshot,
  _counts: Record<string, number> = {},
  over: Partial<WorkspaceView> = {},
): WorkspaceView {
  return {
    tree,
    conversations: [],
    active: null,
    listCollapsed: false,
    platformFilter: 'all',
    setPlatformFilter: vi.fn(),
    tagFilter: [],
    setTagFilter: vi.fn(),
    status: 'ready',
    refresh: vi.fn(),
    retry: vi.fn(),
    mutate: vi.fn(async () => ({ ok: true, applied: true })),
    ...over,
  };
}

/** `n` conversations filed into `folderId` on `platform` (for count-badge tests). */
function convsIn(folderId: string, n: number, platform: ConversationIndex['platform'] = 'claude'): ConversationIndex[] {
  return Array.from({ length: n }, (_, i) =>
    conv(`${platform}-${folderId}-${i}`, { folderId, platform, nativeId: `${folderId}-${i}` }),
  );
}

let container: HTMLElement | null = null;
function renderSidebar(view: WorkspaceView): HTMLElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  render(<Sidebar platform="claude" view={view} />, container);
  return container;
}
const $ = (sel: string) => container!.querySelector(sel) as HTMLElement | null;
const $$ = (sel: string) => [...container!.querySelectorAll(sel)] as HTMLElement[];
const flush = async () => {
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
};

afterEach(() => {
  if (container) render(null, container);
  document.body.innerHTML = '';
  container = null;
});

describe('Sidebar empty state (sidebar-shell)', () => {
  it('renders the ghost create-folder row (not a card) when no active folders exist', () => {
    renderSidebar(makeView({ active: [], pinned: [], archived: [] }));
    // The dedicated "No folders yet" card is retired — the no-folders path always
    // falls to the slim ghost row.
    expect($('[data-testid=sk-folders-empty]')).toBeNull();
    expect($('[data-testid=sk-ghost-new-folder]')).toBeTruthy();
  });

  it('the ghost row opens the create-folder dialog', async () => {
    renderSidebar(makeView({ active: [], pinned: [], archived: [] }));
    expect($('[data-testid=sk-folder-dialog]')).toBeNull();
    $('[data-testid=sk-ghost-new-folder]')!.click();
    await new Promise((r) => setTimeout(r, 0)); // let Preact flush the state update
    expect($('[data-testid=sk-folder-dialog]')).toBeTruthy();
  });

  it('renders the ghost row when unfiled conversations exist', () => {
    renderSidebar(
      makeView({ active: [], pinned: [], archived: [] }, {}, { conversations: [conv('u1'), conv('u2')] }),
    );
    expect($('[data-testid=sk-folders-empty]')).toBeNull();
    expect($('[data-testid=sk-ghost-new-folder]')).toBeTruthy();
    expect($('[data-testid=sk-unfiled]')).toBeTruthy();
  });

  it('renders the ghost row when archived conversations exist', () => {
    renderSidebar(
      makeView({ active: [], pinned: [], archived: [] }, {}, { conversations: [conv('a1', { archived: true })] }),
    );
    expect($('[data-testid=sk-folders-empty]')).toBeNull();
    expect($('[data-testid=sk-ghost-new-folder]')).toBeTruthy();
    expect($('[data-testid=sk-archive-dock]')).toBeTruthy();
  });
});

describe('Sidebar Uncategorized section (folders)', () => {
  it('renders the Uncategorized section with a 0 count and its empty-state message', () => {
    renderSidebar(makeView({ active: [], pinned: [], archived: [] }));
    const unfiled = $('[data-testid=sk-unfiled]');
    expect(unfiled).toBeTruthy();
    expect($('[data-testid=sk-unfiled-count]')!.textContent).toBe('0');
    // Expanded by default, so the empty-state message is visible without a click.
    const empty = $('[data-testid=sk-conv-empty]');
    expect(empty).toBeTruthy();
    expect(empty!.textContent).toContain('Your chats will appear here');
  });

  it('lists unfiled conversations with a matching count when present', () => {
    renderSidebar(
      makeView({ active: [], pinned: [], archived: [] }, {}, { conversations: [conv('u1'), conv('u2')] }),
    );
    expect($('[data-testid=sk-unfiled-count]')!.textContent).toBe('2');
    expect($$('[data-testid=sk-conv-row]').length).toBe(2);
  });

  it('starts expanded on first paint and is included in expand-all', async () => {
    renderSidebar(makeView({ active: [], pinned: [], archived: [] }));
    // First paint: caret reports expanded and the empty body is rendered.
    expect($('[data-testid=sk-unfiled-caret]')!.getAttribute('aria-expanded')).toBe('true');
    expect($('[data-testid=sk-conv-empty]')).toBeTruthy();
    // Collapse, then "expand all" must bring it back (the section is in the set).
    $('[data-testid=sk-unfiled-caret]')!.click();
    await flush();
    expect($('[data-testid=sk-unfiled-caret]')!.getAttribute('aria-expanded')).toBe('false');
    $('[data-testid=sk-expand-all]')!.click();
    await flush();
    expect($('[data-testid=sk-unfiled-caret]')!.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('Sidebar pinned & archive rows (folders delta)', () => {
  it('a pinned row shows the folder icon, color, and count', () => {
    const pin = folder('p1', { name: 'Launch brief', icon: '📌', color: '#f80', pinned: true });
    renderSidebar(
      makeView({ active: [], pinned: [pin], archived: [] }, {}, { conversations: convsIn('p1', 5) }),
    );

    const row = $('[data-pinned-id=p1]')!;
    expect(row).toBeTruthy();
    expect(row.querySelector('.sk-row__icon')!.textContent).toBe('📌');
    expect((row.querySelector('.sk-row__label') as HTMLElement).style.color).toBeTruthy();
    expect(row.querySelector('[data-testid=sk-folder-count]')!.textContent).toBe('5');
  });

  it('renders the default folder icon as a tintable SVG in the folder colour', () => {
    const def = folder('d1', { name: 'Branded', icon: FOLDER_ICON_SENTINEL, color: '#5aa9e6', pinned: true });
    renderSidebar(makeView({ active: [], pinned: [def], archived: [] }));
    const tinted = $('[data-pinned-id=d1] [data-testid=sk-row-folder-icon]') as HTMLElement;
    expect(tinted).toBeTruthy();
    expect(tinted.querySelector('svg')).toBeTruthy();
    // Tinted in the folder's colour (not a plain emoji glyph).
    expect(tinted.style.color).toBeTruthy();
  });

  it('renders an emoji icon un-tinted (no folder-icon SVG, no colour tint)', () => {
    const pin = folder('e1', { name: 'Emoji', icon: '📌', color: '#f80', pinned: true });
    renderSidebar(makeView({ active: [], pinned: [pin], archived: [] }));
    const row = $('[data-pinned-id=e1]')!;
    expect(row.querySelector('[data-testid=sk-row-folder-icon]')).toBeNull();
    const glyph = row.querySelector('.sk-row__icon') as HTMLElement;
    expect(glyph.textContent).toBe('📌');
    expect(glyph.querySelector('svg')).toBeNull();
  });

  it('clicking a pinned row jumps to the folder’s canonical tree copy (expands its path)', async () => {
    const f = folder('p1', { name: 'Launch brief', pinned: true });
    // p1 is both pinned (the shortcut) and present in the active tree (its canonical,
    // expandable copy), with one filed conversation that is hidden until expanded.
    renderSidebar(
      makeView(
        { active: [node(f)], pinned: [f], archived: [] },
        {},
        { conversations: convsIn('p1', 1) },
      ),
    );

    // Collapsed by default: the canonical row exists, but its conversation is hidden.
    const canonical = $('[data-folder-id=p1]')!;
    expect(canonical).toBeTruthy();
    expect(canonical.parentElement!.querySelector('.sk-conv-row')).toBeNull();

    $('[data-pinned-id=p1]')!.click();
    await flush();

    // The path expanded, so the conversation under the canonical copy now renders.
    expect($('[data-folder-id=p1]')!.parentElement!.querySelector('.sk-conv-row')).toBeTruthy();
  });

  it('an archive row shows the folder count', () => {
    const arc = folder('a1', { name: 'Old work', archived: true });
    renderSidebar(
      makeView({ active: [node(folder('x'))], pinned: [], archived: [arc] }, {}, { conversations: convsIn('a1', 3) }),
    );

    const row = $('[data-archived-id=a1]')!;
    expect(row).toBeTruthy();
    expect(row.querySelector('[data-testid=sk-folder-count]')!.textContent).toBe('3');
  });

  it("a parent folder's count includes conversations in its subfolders", () => {
    const child = node(folder('child', { name: 'Child', parentId: 'parent' }));
    child.depth = 2;
    renderSidebar(
      makeView({ active: [node(folder('parent', { name: 'Parent' }), [child])], pinned: [], archived: [] }, {}, {
        conversations: [
          conv('a', { folderId: 'parent' }),
          conv('b', { folderId: 'child' }),
          conv('c', { folderId: 'child' }),
        ],
      }),
    );
    // Parent: 1 direct + 2 in the (collapsed) subfolder = 3.
    expect($('[data-folder-id=parent] [data-testid=sk-folder-count]')!.textContent).toBe('3');
  });

  it('does not render a standalone flat conversation list (folders-only tree)', () => {
    renderSidebar(
      makeView({ active: [node(folder('x'))], pinned: [], archived: [] }, {}, {
        conversations: [conv('a', { folderId: 'x', title: 'Alpha' })],
      }),
    );
    // The conversation is collapsed inside its folder, not shown as a top-level list.
    expect($('[data-testid=sk-conv-row]')).toBeNull();
  });
});

describe('Sidebar folder dialog defaults (folders / D5)', () => {
  const openCreate = async () => {
    renderSidebar(makeView({ active: [], pinned: [], archived: [] }));
    $('[data-testid=sk-ghost-new-folder]')!.click();
    await new Promise((r) => setTimeout(r, 0));
  };

  it('preselects the folder icon and the blue colour for a new folder', async () => {
    await openCreate();
    const def = $('[data-testid=sk-folder-icon-default]') as HTMLButtonElement;
    expect(def).toBeTruthy();
    expect(def.getAttribute('aria-pressed')).toBe('true');
    expect(def.querySelector('svg')).toBeTruthy();
    // Blue swatch (#5aa9e6) preselected; the "no colour" clear chip is not.
    const blue = $('[aria-label="#5aa9e6"]') as HTMLButtonElement;
    expect(blue.getAttribute('aria-pressed')).toBe('true');
    const clearColor = $('[data-testid=sk-folder-colors] .sk-swatch--clear') as HTMLButtonElement;
    expect(clearColor.getAttribute('aria-pressed')).toBe('false');
  });

  it('keeps the clear/"no icon" and clear/"no colour" options reachable', async () => {
    await openCreate();
    const clearIcon = $('[data-testid=sk-folder-icons] .sk-icon-option--clear') as HTMLButtonElement;
    clearIcon.click();
    await new Promise((r) => setTimeout(r, 0));
    // Clearing deselects the default folder-icon slot (cleared ≠ default).
    expect(($('[data-testid=sk-folder-icon-default]') as HTMLButtonElement).getAttribute('aria-pressed')).toBe('false');
    expect(clearIcon.getAttribute('aria-pressed')).toBe('true');

    const clearColor = $('[data-testid=sk-folder-colors] .sk-swatch--clear') as HTMLButtonElement;
    clearColor.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(clearColor.getAttribute('aria-pressed')).toBe('true');
  });

  it('creates a folder carrying the folder-icon sentinel and blue by default', async () => {
    const mutate = vi.fn(async () => ({ ok: true, applied: true }));
    renderSidebar(makeView({ active: [], pinned: [], archived: [] }, {}, { mutate }));
    $('[data-testid=sk-ghost-new-folder]')!.click();
    await new Promise((r) => setTimeout(r, 0));
    const input = $('[data-testid=sk-folder-name]') as HTMLInputElement;
    input.value = 'Research';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
    const form = $('.sk-dialog__body') as HTMLFormElement;
    if (typeof form.requestSubmit === 'function') form.requestSubmit();
    else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ op: 'folder.create', name: 'Research', icon: FOLDER_ICON_SENTINEL, color: '#5aa9e6' }),
    );
  });
});

describe('Sidebar inline expansion (drill-in)', () => {
  it('reveals a folder’s conversations only after expanding it', async () => {
    renderSidebar(
      makeView({ active: [node(folder('x', { name: 'Research' }))], pinned: [], archived: [] }, { x: 1 }, {
        conversations: [conv('a', { folderId: 'x', title: 'Alpha' })],
      }),
    );
    expect($('[data-testid=sk-conv-row]')).toBeNull();

    ($('[data-testid=sk-folder-caret]') as HTMLElement).click();
    await flush();

    const rows = $$('[data-testid=sk-conv-row]');
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelector('[data-testid=sk-conv-title]')!.textContent).toBe('Alpha');
  });

  it('expand-all opens every folder (nested + archived) but leaves the Archive dock as-is', async () => {
    const child = node(folder('child', { name: 'Child', parentId: 'parent' }));
    child.depth = 2;
    renderSidebar(
      makeView(
        {
          active: [node(folder('parent', { name: 'Parent' }), [child])],
          pinned: [],
          archived: [folder('arch', { name: 'Archived', archived: true })],
        },
        {},
        {
          conversations: [
            conv('a', { folderId: 'parent', title: 'Alpha' }),
            conv('b', { folderId: 'child', title: 'Beta' }),
            conv('c', { folderId: 'arch', title: 'Gamma' }),
            conv('u', { folderId: null, title: 'Loose' }),
          ],
        },
      ),
    );
    // Folders start collapsed; only the Unfiled node is open by default, so just its
    // loose conversation shows. The Archive dock is collapsed.
    expect($$('[data-testid=sk-conv-title]').map((e) => e.textContent)).toEqual(['Loose']);
    const archive = $('[data-testid=sk-archive]') as HTMLDetailsElement;
    expect(archive.open).toBe(false);

    ($('[data-testid=sk-expand-all]') as HTMLElement).click();
    await flush();
    // The Archive dock is left untouched (still closed) — only its inner folders'
    // expansion state is set. The active tree + Unfiled bodies are revealed now.
    expect(archive.open).toBe(false);
    const titles = $$('[data-testid=sk-conv-title]').map((e) => e.textContent);
    expect(titles).toEqual(expect.arrayContaining(['Alpha', 'Beta', 'Loose']));

    // Opening the Archive dock now reveals its folder already expanded.
    archive.open = true;
    archive.dispatchEvent(new Event('toggle'));
    await flush();
    expect($('[data-testid=sk-archive] [data-testid=sk-conv-title]')!.textContent).toBe('Gamma');

    ($('[data-testid=sk-collapse-all]') as HTMLElement).click();
    await flush();
    expect($$('[data-testid=sk-conv-row]')).toHaveLength(0);
  });

  it('shows unfiled conversations under the Unfiled node, expanded by default', async () => {
    renderSidebar(
      makeView({ active: [node(folder('x'))], pinned: [], archived: [] }, {}, {
        conversations: [conv('u1', { folderId: null, title: 'Loose' })],
      }),
    );
    const unfiled = $('[data-testid=sk-unfiled]')!;
    expect(unfiled).toBeTruthy();
    expect(unfiled.querySelector('[data-testid=sk-unfiled-count]')!.textContent).toBe('1');
    // Expanded on first paint — the loose conversation leads without a click.
    expect($$('[data-testid=sk-conv-row]')).toHaveLength(1);

    // The caret still toggles it closed.
    ($('[data-testid=sk-unfiled-caret]') as HTMLElement).click();
    await flush();
    expect($('[data-testid=sk-conv-row]')).toBeNull();
  });

  it('excludes archived conversations from a folder badge and its rendered rows', async () => {
    renderSidebar(
      makeView({ active: [node(folder('x', { name: 'Research' }))], pinned: [], archived: [] }, {}, {
        conversations: [
          conv('a', { folderId: 'x', title: 'Alpha' }),
          conv('b', { folderId: 'x', title: 'Beta', archived: true }),
        ],
      }),
    );
    // The archived chat is dropped from the count (2 filed, but 1 archived → 1).
    expect($('[data-folder-id=x] [data-testid=sk-folder-count]')!.textContent).toBe('1');

    ($('[data-testid=sk-folder-caret]') as HTMLElement).click();
    await flush();
    // Scope to the folder's own body — the archived chat surfaces only in the
    // dedicated Archived section, never inside its origin folder.
    const folderRows = [
      ...$('[data-folder-id=x]')!.parentElement!.querySelectorAll('[data-testid=sk-conv-row]'),
    ] as HTMLElement[];
    expect(folderRows).toHaveLength(1);
    expect(folderRows[0].querySelector('[data-testid=sk-conv-title]')!.textContent).toBe('Alpha');
  });

  it('excludes archived conversations from the Unfiled count', () => {
    renderSidebar(
      makeView({ active: [node(folder('x'))], pinned: [], archived: [] }, {}, {
        conversations: [
          conv('u1', { folderId: null, title: 'Loose' }),
          conv('u2', { folderId: null, title: 'Stowed', archived: true }),
        ],
      }),
    );
    expect($('[data-testid=sk-unfiled-count]')!.textContent).toBe('1');
  });

  it('still renders the Uncategorized node (count 0) when every conversation is filed', () => {
    renderSidebar(
      makeView({ active: [node(folder('x'))], pinned: [], archived: [] }, {}, {
        conversations: [conv('a', { folderId: 'x' })],
      }),
    );
    // The section is a permanent fixture now — present even at a count of 0.
    expect($('[data-testid=sk-unfiled]')).toBeTruthy();
    expect($('[data-testid=sk-unfiled-count]')!.textContent).toBe('0');
  });

  it('auto-expands the path to the active-tab conversation and highlights it', async () => {
    const child = { folder: folder('bench', { name: 'Benchmarks', parentId: 'research' }), depth: 2, children: [] };
    const tree: FolderTreeSnapshot = {
      active: [node(folder('research', { name: 'Research' }), [child])],
      pinned: [],
      archived: [],
    };
    const id = conversationId('claude', 'c1');
    const active: ActiveConversation = { platform: 'claude', nativeId: 'c1', title: 'Latency', updatedAt: 1 };
    renderSidebar(
      makeView(tree, { research: 1, bench: 1 }, {
        conversations: [conv(id, { nativeId: 'c1', folderId: 'bench', title: 'Latency' })],
        active,
      }),
    );
    await flush();

    // The active conversation's row is revealed (its folder chain auto-expanded)…
    const activeRow = $$('[data-testid=sk-conv-row]').find((r) => r.getAttribute('aria-current') === 'true');
    expect(activeRow).toBeTruthy();
    expect(activeRow!.querySelector('[data-testid=sk-conv-title]')!.textContent).toBe('Latency');
  });
});

describe('Sidebar archive dock (bottom-pinned archive)', () => {
  it('renders no archive dock when nothing is archived', () => {
    renderSidebar(
      makeView({ active: [node(folder('x'))], pinned: [], archived: [] }, {}, {
        conversations: [conv('a', { folderId: 'x' })],
      }),
    );
    expect($('[data-testid=sk-archive-dock]')).toBeNull();
    expect($('[data-testid=sk-archive]')).toBeNull();
  });

  it('shows the Archive section, holding archived chats, when a chat is archived', () => {
    renderSidebar(
      makeView({ active: [node(folder('x'))], pinned: [], archived: [] }, {}, {
        conversations: [
          conv('a', { folderId: 'x', title: 'Alpha' }),
          conv('b', { folderId: 'x', title: 'Beta', archived: true }),
        ],
      }),
    );
    const dock = $('[data-testid=sk-archive-dock]');
    expect(dock).toBeTruthy();
    // The unified Archive section lives inside the dock; its badge counts archived
    // folders + chats (here: one archived chat).
    const archive = $('[data-testid=sk-archive]');
    expect(archive).toBeTruthy();
    expect(dock!.contains(archive)).toBe(true);
    expect($('[data-testid=sk-archive-count]')!.textContent).toBe('1');
  });

  it('places the live tree in the scroll region, separate from the archive dock', () => {
    renderSidebar(
      makeView({ active: [node(folder('x', { name: 'Research' }))], pinned: [], archived: [] }, {}, {
        conversations: [conv('b', { folderId: 'x', archived: true })],
      }),
    );
    const scroll = $('[data-testid=sk-sidebar-scroll]')!;
    const dock = $('[data-testid=sk-archive-dock]')!;
    // The Folders tree renders inside the scroll region; the archive dock does not.
    expect(scroll.querySelector('[data-folder-id=x]')).toBeTruthy();
    expect(dock.querySelector('[data-folder-id=x]')).toBeNull();
    expect(scroll.contains(dock)).toBe(false);
  });

  it('docks the Archive section for an archived folder even without archived chats', () => {
    const arc = folder('a1', { name: 'Old work', archived: true });
    renderSidebar(
      makeView({ active: [node(folder('x'))], pinned: [], archived: [arc] }, {}, {
        conversations: [conv('a', { folderId: 'x' })],
      }),
    );
    const dock = $('[data-testid=sk-archive-dock]')!;
    expect(dock).toBeTruthy();
    // No archived chats, one archived folder: the section docks and its badge counts
    // the lone archived folder.
    expect(dock.querySelector('[data-testid=sk-archive]')).toBeTruthy();
    expect($('[data-testid=sk-archive-count]')!.textContent).toBe('1');
  });
});

describe('Sidebar load states (workspace-view-recovery 7.4)', () => {
  const EMPTY: FolderTreeSnapshot = { active: [], pinned: [], archived: [] };

  it('hides the ghost create-folder row until a read has succeeded', () => {
    renderSidebar(makeView(EMPTY, {}, { status: 'loading' }));
    expect($('[data-testid=sk-ghost-new-folder]')).toBeNull();
  });

  it('shows the ghost row only once a read succeeded and returned no folders', () => {
    renderSidebar(makeView(EMPTY, {}, { status: 'ready' }));
    expect($('[data-testid=sk-ghost-new-folder]')).toBeTruthy();
  });

  it('shows a retry affordance on a failed load, not the ghost row', () => {
    const retry = vi.fn();
    renderSidebar(makeView(EMPTY, {}, { status: 'error', retry }));
    expect($('[data-testid=sk-ghost-new-folder]')).toBeNull();
    const retryBtn = $('[data-testid=sk-folders-retry]');
    expect(retryBtn).toBeTruthy();
    retryBtn!.click();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('renders skeleton rows while loading, not the ghost row (loading-states D-2)', () => {
    // The loading affordance is now skeleton rows (replacing the old delayed
    // spinner): they show immediately on `loading`, never the ghost create row.
    renderSidebar(makeView(EMPTY, {}, { status: 'loading' }));
    expect($('[data-testid=sk-folders-skeleton]')).toBeTruthy();
    expect($('[data-testid=sk-ghost-new-folder]')).toBeNull();
  });
});

describe('Sidebar create-dialog failure (workspace-view-recovery 7.5)', () => {
  const EMPTY: FolderTreeSnapshot = { active: [], pinned: [], archived: [] };
  const type = (testid: string, value: string) => {
    const input = $(`[data-testid=${testid}]`) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const submitForm = () => {
    const form = $('.sk-dialog__body') as HTMLFormElement;
    // Spec-correct submit that runs the onSubmit handler (preventDefault stops nav).
    if (typeof form.requestSubmit === 'function') form.requestSubmit();
    else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  };
  const flush = async () => {
    for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
  };

  it('keeps the dialog open with the typed input and an error when the mutation fails', async () => {
    const mutate = vi.fn(async () => ({ ok: false, applied: false }));
    renderSidebar(makeView(EMPTY, {}, { status: 'ready', mutate }));

    $('[data-testid=sk-ghost-new-folder]')!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect($('[data-testid=sk-folder-dialog]')).toBeTruthy();

    type('sk-folder-name', 'Research');
    await flush(); // let setName re-render so the submit handler sees the typed name
    submitForm();
    await flush();

    expect(mutate).toHaveBeenCalledTimes(1);
    // Dialog stays open, input is preserved, and the failure is surfaced.
    expect($('[data-testid=sk-folder-dialog]')).toBeTruthy();
    expect(($('[data-testid=sk-folder-name]') as HTMLInputElement).value).toBe('Research');
    expect($('[data-testid=sk-folder-error]')).toBeTruthy();
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it('closes the dialog when the mutation takes effect', async () => {
    const mutate = vi.fn(async () => ({ ok: true, applied: true }));
    renderSidebar(makeView(EMPTY, {}, { status: 'ready', mutate }));

    $('[data-testid=sk-ghost-new-folder]')!.click();
    await new Promise((r) => setTimeout(r, 0));
    type('sk-folder-name', 'Research');
    await flush(); // let setName re-render so the submit handler sees the typed name
    submitForm();
    await flush();

    expect(mutate).toHaveBeenCalledTimes(1);
    expect($('[data-testid=sk-folder-dialog]')).toBeNull();
  });
});

describe('Sidebar folder actions menu (⋯ button)', () => {
  // The folder actions menu is opened from a per-row `⋯` button (not right-click);
  // the button is always in the DOM (revealed on hover/focus via CSS) so tests can
  // click it directly. Clicking it sets the menu target and opens the Zag menu.
  const openMenu = (rowSel: string) => {
    const row = $(rowSel)!;
    const btn = row.querySelector('[data-testid=sk-folder-menu]') as HTMLElement;
    btn.click();
  };

  it('renders a ⋯ actions button after the count on an active-tree folder row', () => {
    renderSidebar(makeView({ active: [node(folder('x', { name: 'Research' }))], pinned: [], archived: [] }));
    const row = $('[data-folder-id=x]')!;
    const btn = row.querySelector('[data-testid=sk-folder-menu]') as HTMLElement;
    expect(btn).toBeTruthy();
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.getAttribute('aria-label')).toBe('Folder actions');
    // The button sits after the count span in the row.
    const kids = [...row.children];
    expect(kids.indexOf(row.querySelector('[data-testid=sk-folder-count]')!)).toBeLessThan(kids.indexOf(btn));
  });

  it('clicking the ⋯ button opens the folder actions menu', async () => {
    renderSidebar(makeView({ active: [node(folder('x', { name: 'Research' }))], pinned: [], archived: [] }));
    expect($('[data-testid=sk-context-menu]')).toBeNull();
    openMenu('[data-folder-id=x]');
    await flush();
    const menu = $('[data-testid=sk-context-menu]');
    expect(menu).toBeTruthy();
    expect($('[data-testid=sk-menu-rename]')).toBeTruthy();
    expect($('[data-testid=sk-menu-pin]')).toBeTruthy();
    expect($('[data-testid=sk-menu-archive]')).toBeTruthy();
    expect($('[data-testid=sk-menu-move-top]')).toBeTruthy();
    expect($('[data-testid=sk-menu-delete]')).toBeTruthy();
    // Reorder left the menu — it's now drag-only — so the menu is five items, and a
    // divider sets the destructive Delete apart from the routine actions above it.
    expect(menu!.querySelectorAll('.sk-menu__item')).toHaveLength(5);
    const divider = menu!.querySelector('.sk-menu__divider');
    expect(divider).toBeTruthy();
    const kids = [...menu!.children];
    expect(kids.indexOf(divider!)).toBe(kids.indexOf($('[data-testid=sk-menu-delete]')!) - 1);
  });

  it('clicking the ⋯ button does not toggle the folder’s expansion', async () => {
    renderSidebar(
      makeView({ active: [node(folder('x', { name: 'Research' }))], pinned: [], archived: [] }, {}, {
        conversations: [conv('a', { folderId: 'x', title: 'Alpha' })],
      }),
    );
    openMenu('[data-folder-id=x]');
    await flush();
    // The menu opened but the folder stayed collapsed (no conversation rows revealed).
    expect($('[data-testid=sk-context-menu]')).toBeTruthy();
    expect($('[data-testid=sk-conv-row]')).toBeNull();
  });

  it('Pin from the menu fires a folder.pin mutation toggling the state', async () => {
    const mutate = vi.fn(async () => ({ ok: true, applied: true }));
    renderSidebar(
      makeView({ active: [node(folder('x', { name: 'Research' }))], pinned: [], archived: [] }, {}, { mutate }),
    );
    openMenu('[data-folder-id=x]');
    await flush();
    ($('[data-testid=sk-menu-pin]') as HTMLElement).click();
    await flush();
    expect(mutate).toHaveBeenCalledWith({ op: 'folder.pin', id: 'x', pinned: true });
  });

  it('Delete from the menu opens a confirm dialog and does not delete until confirmed', async () => {
    const mutate = vi.fn(async () => ({ ok: true, applied: true }));
    renderSidebar(
      makeView({ active: [node(folder('x', { name: 'Research' }))], pinned: [], archived: [] }, {}, { mutate }),
    );
    openMenu('[data-folder-id=x]');
    await flush();
    ($('[data-testid=sk-menu-delete]') as HTMLElement).click();
    await flush();
    // Selecting Delete opens a confirm dialog; the mutation has NOT fired yet.
    expect($('[data-testid=sk-folder-delete-confirm]')).toBeTruthy();
    expect(mutate).not.toHaveBeenCalled();
    // Confirming fires the mutation and closes the dialog.
    ($('[data-testid=sk-folder-delete-confirm-btn]') as HTMLElement).click();
    await flush();
    expect(mutate).toHaveBeenCalledWith({ op: 'folder.delete', id: 'x' });
    expect($('[data-testid=sk-folder-delete-confirm]')).toBeNull();
  });

  it('Cancelling the delete dialog fires no mutation', async () => {
    const mutate = vi.fn(async () => ({ ok: true, applied: true }));
    renderSidebar(
      makeView({ active: [node(folder('x', { name: 'Research' }))], pinned: [], archived: [] }, {}, { mutate }),
    );
    openMenu('[data-folder-id=x]');
    await flush();
    ($('[data-testid=sk-menu-delete]') as HTMLElement).click();
    await flush();
    ($('[data-testid=sk-folder-delete-cancel]') as HTMLElement).click();
    await flush();
    expect(mutate).not.toHaveBeenCalled();
    expect($('[data-testid=sk-folder-delete-confirm]')).toBeNull();
  });

  it('the delete dialog states the disposition of the folder’s conversations', async () => {
    renderSidebar(
      makeView({ active: [node(folder('x', { name: 'Research' }))], pinned: [], archived: [] }, {}, {
        conversations: [
          conv('a', { folderId: 'x', title: 'Alpha' }),
          conv('b', { folderId: 'x', title: 'Beta' }),
        ],
      }),
    );
    openMenu('[data-folder-id=x]');
    await flush();
    ($('[data-testid=sk-menu-delete]') as HTMLElement).click();
    await flush();
    const disposition = $('[data-testid=sk-folder-delete-disposition]');
    expect(disposition?.textContent).toContain('2 conversations move to Uncategorized');
  });

  it('Rename from the menu opens the edit dialog for that folder', async () => {
    renderSidebar(
      makeView({ active: [node(folder('x', { name: 'Research' }))], pinned: [], archived: [] }),
    );
    openMenu('[data-folder-id=x]');
    await flush();
    ($('[data-testid=sk-menu-rename]') as HTMLElement).click();
    await flush();
    const dialog = $('[data-testid=sk-folder-dialog]');
    expect(dialog).toBeTruthy();
    expect(($('[data-testid=sk-folder-name]') as HTMLInputElement).value).toBe('Research');
  });

  it('a pinned leaf row exposes the ⋯ button and its menu acts on the folder', async () => {
    const mutate = vi.fn(async () => ({ ok: true, applied: true }));
    // A pinned folder is mirrored in the active tree (resolveFolder reads it there);
    // the pinned leaf is its second surface in the rail.
    const pin = folder('p1', { name: 'Launch brief', pinned: true });
    renderSidebar(makeView({ active: [node(pin)], pinned: [pin], archived: [] }, {}, { mutate }));
    expect($('[data-pinned-id=p1] [data-testid=sk-folder-menu]')).toBeTruthy();
    openMenu('[data-pinned-id=p1]');
    await flush();
    // A pinned folder's action reads "Unpin"; clicking it un-pins.
    expect($('[data-testid=sk-menu-pin]')!.textContent).toBe('Unpin');
    ($('[data-testid=sk-menu-pin]') as HTMLElement).click();
    await flush();
    expect(mutate).toHaveBeenCalledWith({ op: 'folder.pin', id: 'p1', pinned: false });
  });

  it('an archived leaf row exposes the ⋯ button and can be unarchived from its menu', async () => {
    const mutate = vi.fn(async () => ({ ok: true, applied: true }));
    const arc = folder('a1', { name: 'Old work', archived: true });
    renderSidebar(
      makeView({ active: [node(folder('x'))], pinned: [], archived: [arc] }, {}, { mutate }),
    );
    expect($('[data-archived-id=a1] [data-testid=sk-folder-menu]')).toBeTruthy();
    openMenu('[data-archived-id=a1]');
    await flush();
    // An archived folder's action reads "Unarchive"; clicking it un-archives.
    expect($('[data-testid=sk-menu-archive]')!.textContent).toBe('Unarchive');
    ($('[data-testid=sk-menu-archive]') as HTMLElement).click();
    await flush();
    expect(mutate).toHaveBeenCalledWith({ op: 'folder.archive', id: 'a1', archived: false });
  });
});

describe('Sidebar archived conversations section', () => {
  it('does not render the archived section when no conversation is archived', () => {
    renderSidebar(
      makeView({ active: [node(folder('x'))], pinned: [], archived: [] }, {}, {
        conversations: [conv('a', { folderId: 'x', title: 'Alpha' })],
      }),
    );
    expect($('[data-testid=sk-archive]')).toBeNull();
  });

  it('renders the archived section with a count and the archived rows when they exist', () => {
    renderSidebar(
      makeView({ active: [node(folder('x'))], pinned: [], archived: [] }, {}, {
        conversations: [
          conv('a', { folderId: 'x', title: 'Alpha' }),
          conv('z1', { folderId: 'x', title: 'Stowed one', archived: true }),
          conv('z2', { folderId: null, title: 'Stowed two', archived: true }),
        ],
      }),
    );
    const section = $('[data-testid=sk-archive]')!;
    expect(section).toBeTruthy();
    expect(section.querySelector('summary')!.textContent).toContain('Archive');
    expect($('[data-testid=sk-archive-count]')!.textContent).toBe('2');
    const ids = [...section.querySelectorAll('[data-testid=sk-conv-row]')].map(
      (r) => (r as HTMLElement).dataset.conversationId,
    );
    expect(ids.sort()).toEqual(['z1', 'z2']);
    // The live (non-archived) row is not duplicated into the archived section.
    expect(ids).not.toContain('a');
  });

  it('Unarchive from an archived row’s menu fires an unarchive mutation', async () => {
    const mutate = vi.fn(async () => ({ ok: true, applied: true }));
    renderSidebar(
      makeView({ active: [node(folder('x'))], pinned: [], archived: [] }, {}, {
        conversations: [conv('z1', { folderId: 'x', title: 'Stowed', archived: true })],
        mutate,
      }),
    );
    const section = $('[data-testid=sk-archive]')!;
    const row = [...section.querySelectorAll('[data-testid=sk-conv-row]')].find(
      (r) => (r as HTMLElement).dataset.conversationId === 'z1',
    ) as HTMLElement;
    (row.querySelector('[data-testid=sk-conv-menu]') as HTMLElement).click();
    await flush();
    // An archived conversation's action reads "Unarchive"; clicking it un-archives.
    expect($('[data-testid=sk-conv-menu-archive]')!.textContent).toBe('Unarchive');
    ($('[data-testid=sk-conv-menu-archive]') as HTMLElement).click();
    await flush();
    expect(mutate).toHaveBeenCalledWith({ op: 'conversation.archive', conversationId: 'z1', archived: false });
  });
});

describe('Sidebar unified browser + platform view-filter (folder-scope-reconciliation / D28)', () => {
  // A folder holding conversations assigned from two different platforms.
  const tree: FolderTreeSnapshot = { active: [node(folder('x', { name: 'Mixed' }))], pinned: [], archived: [] };
  const mixedConvs: ConversationIndex[] = [
    conv('claude::c1', { platform: 'claude', nativeId: 'c1', folderId: 'x', title: 'Claude chat' }),
    conv('gemini::g1', { platform: 'gemini', nativeId: 'g1', folderId: 'x', title: 'Gemini chat' }),
  ];
  const expandFolder = async () => {
    ($('[data-testid=sk-folder-caret]') as HTMLElement).click();
    await flush();
  };

  it('renders conversations from every platform under "All", and the badge equals the rendered rows (5.2)', async () => {
    renderSidebar(makeView(tree, {}, { conversations: mixedConvs, platformFilter: 'all' }));
    // The "5 vs empty" regression guard: badge equals the unified contents…
    expect($('[data-testid=sk-folder-count]')!.textContent).toBe('2');
    await expandFolder();
    // …and the body actually lists both platforms' conversations (never empty).
    expect($$('[data-testid=sk-conv-row]')).toHaveLength(2);
  });

  it('narrows folder contents AND the badge to a selected platform; "All" restores the unified view (5.3)', async () => {
    renderSidebar(makeView(tree, {}, { conversations: mixedConvs, platformFilter: 'gemini' }));
    expect($('[data-testid=sk-folder-count]')!.textContent).toBe('1');
    await expandFolder();
    const rows = $$('[data-testid=sk-conv-row]');
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelector('[data-testid=sk-conv-title]')!.textContent).toBe('Gemini chat');

    // "All" restores the unified badge (2) over the same data.
    renderSidebar(makeView(tree, {}, { conversations: mixedConvs, platformFilter: 'all' }));
    expect($('[data-testid=sk-folder-count]')!.textContent).toBe('2');
  });

  it('narrows the Unfiled list by the platform filter too (5.3)', () => {
    const unfiled: ConversationIndex[] = [
      conv('claude::u1', { platform: 'claude', nativeId: 'u1', folderId: null }),
      conv('gemini::u2', { platform: 'gemini', nativeId: 'u2', folderId: null }),
    ];
    renderSidebar(
      makeView({ active: [], pinned: [], archived: [] }, {}, { conversations: unfiled, platformFilter: 'claude' }),
    );
    expect($('[data-testid=sk-unfiled-count]')!.textContent).toBe('1');
  });

  it('keeps the active-conversation row highlighted in the unified list and under a matching filter (5.5)', async () => {
    const active: ActiveConversation = { platform: 'claude', nativeId: 'c1', title: 'Claude chat', updatedAt: 1 };

    // Under "All" the active row is auto-revealed and highlighted among other platforms' rows.
    renderSidebar(makeView(tree, {}, { conversations: mixedConvs, active, platformFilter: 'all' }));
    await flush();
    let activeRow = $$('[data-testid=sk-conv-row]').find((r) => r.getAttribute('aria-current') === 'true');
    expect(activeRow).toBeTruthy();
    expect(activeRow!.querySelector('[data-testid=sk-conv-title]')!.textContent).toBe('Claude chat');

    // Under the matching (claude) filter the highlight survives.
    renderSidebar(makeView(tree, {}, { conversations: mixedConvs, active, platformFilter: 'claude' }));
    await flush();
    activeRow = $$('[data-testid=sk-conv-row]').find((r) => r.getAttribute('aria-current') === 'true');
    expect(activeRow).toBeTruthy();
  });
});

describe('Sidebar folder drag-reorder (seams)', () => {
  // happy-dom's DataTransfer is a no-op, and Preact binds drag listeners under their
  // capitalized names here, so mirror the conversation-list drag test: a shared stub
  // records the dragstart payload and replays it to the drop handler.
  function startFolderDrag(rowSel: string): { setData: (k: string, v: string) => void; getData: (k: string) => string } {
    const store: Record<string, string> = {};
    const dt = { setData: (k: string, v: string) => void (store[k] = v), getData: (k: string) => store[k] ?? '' };
    const ev = new Event('DragStart', { bubbles: true });
    Object.defineProperty(ev, 'dataTransfer', { value: dt });
    $(rowSel)!.dispatchEvent(ev);
    return dt;
  }
  function dropOnSeam(seamKey: string, dt: { getData: (k: string) => string }) {
    const seam = $(`[data-seam="${seamKey}"]`)!;
    const ev = new Event('Drop', { bubbles: true });
    Object.defineProperty(ev, 'dataTransfer', { value: dt });
    seam.dispatchEvent(ev);
  }

  it('shows no reorder seams at rest, and reveals them once a folder drag starts', async () => {
    renderSidebar(
      makeView({ active: [node(folder('a')), node(folder('b')), node(folder('c'))], pinned: [], archived: [] }),
    );
    expect($$('[data-testid=sk-folder-seam]')).toHaveLength(0);
    startFolderDrag('[data-folder-id=a]');
    await flush();
    // Three sibling rows → four insertion slots (before each + after the last).
    expect($$('[data-testid=sk-folder-seam]')).toHaveLength(4);
  });

  it('dropping a folder on a seam reorders its siblings to that slot', async () => {
    const mutate = vi.fn(async () => ({ ok: true, applied: true }));
    renderSidebar(
      makeView(
        { active: [node(folder('a')), node(folder('b')), node(folder('c'))], pinned: [], archived: [] },
        {},
        { mutate },
      ),
    );
    const dt = startFolderDrag('[data-folder-id=a]');
    await flush();
    // Drop 'a' before 'c' (slot 2) → ['b','a','c'].
    dropOnSeam('root:2', dt);
    await flush();
    expect(mutate).toHaveBeenCalledWith({ op: 'folder.reorder', orderedIds: ['b', 'a', 'c'] });
  });

  it('a drop that lands a folder back in its own slot fires no mutation', async () => {
    const mutate = vi.fn(async () => ({ ok: true, applied: true }));
    renderSidebar(
      makeView(
        { active: [node(folder('a')), node(folder('b')), node(folder('c'))], pinned: [], archived: [] },
        {},
        { mutate },
      ),
    );
    const dt = startFolderDrag('[data-folder-id=a]');
    await flush();
    // Slot 0 and slot 1 both leave 'a' first — a no-op, so nothing is dispatched.
    dropOnSeam('root:1', dt);
    await flush();
    expect(mutate).not.toHaveBeenCalled();
  });

  it('dragging a folder into another folder’s child seam re-parents then positions it', async () => {
    const mutate = vi.fn(async () => ({ ok: true, applied: true }));
    renderSidebar(
      makeView(
        { active: [node(folder('p'), [node(folder('c1'))]), node(folder('q'))], pinned: [], archived: [] },
        {},
        { mutate },
      ),
    );
    // Expand 'p' so its child group (and the seams within it) render.
    ($('[data-folder-id=p]')!.querySelector('[data-testid=sk-folder-caret]') as HTMLElement).click();
    await flush();
    const dt = startFolderDrag('[data-folder-id=q]');
    await flush();
    // Drop 'q' before 'c1' (slot 0 of p's children): re-parent under p, then order it first.
    dropOnSeam('p:0', dt);
    await flush();
    expect(mutate).toHaveBeenNthCalledWith(1, { op: 'folder.move', id: 'q', parentId: 'p' });
    expect(mutate).toHaveBeenNthCalledWith(2, { op: 'folder.reorder', orderedIds: ['q', 'c1'] });
  });
});
