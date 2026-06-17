// Sidebar folder-body coverage (happy-dom) using the injectable `view` seam, so
// these run without the worker or IndexedDB. Maps to the sidebar-shell empty-state
// requirement and the folders delta (pinned/archive rows show icon · color · count).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { Sidebar } from '../src/ui/sidebar/Sidebar';
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
    platformFilter: 'all',
    setPlatformFilter: vi.fn(),
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
  it('renders the empty-state card with a New folder CTA when no active folders exist', () => {
    renderSidebar(makeView({ active: [], pinned: [], archived: [] }));
    const empty = $('[data-testid=sk-folders-empty]');
    expect(empty).toBeTruthy();
    expect(empty!.textContent).toContain('No folders yet');
    expect($('[data-testid=sk-empty-new-folder]')).toBeTruthy();
  });

  it('the empty-state CTA opens the create-folder dialog', async () => {
    renderSidebar(makeView({ active: [], pinned: [], archived: [] }));
    expect($('[data-testid=sk-folder-dialog]')).toBeNull();
    $('[data-testid=sk-empty-new-folder]')!.click();
    await new Promise((r) => setTimeout(r, 0)); // let Preact flush the state update
    expect($('[data-testid=sk-folder-dialog]')).toBeTruthy();
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

  it('an archive row shows the folder count', () => {
    const arc = folder('a1', { name: 'Old work', archived: true });
    renderSidebar(
      makeView({ active: [node(folder('x'))], pinned: [], archived: [arc] }, {}, { conversations: convsIn('a1', 3) }),
    );

    const row = $('[data-archived-id=a1]')!;
    expect(row).toBeTruthy();
    expect(row.querySelector('[data-testid=sk-folder-count]')!.textContent).toBe('3');
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

  it('lists unfiled conversations under the Unfiled node when expanded', async () => {
    renderSidebar(
      makeView({ active: [node(folder('x'))], pinned: [], archived: [] }, {}, {
        conversations: [conv('u1', { folderId: null, title: 'Loose' })],
      }),
    );
    const unfiled = $('[data-testid=sk-unfiled]')!;
    expect(unfiled).toBeTruthy();
    expect(unfiled.querySelector('[data-testid=sk-unfiled-count]')!.textContent).toBe('1');
    expect($('[data-testid=sk-conv-row]')).toBeNull();

    ($('[data-testid=sk-unfiled-caret]') as HTMLElement).click();
    await flush();
    expect($$('[data-testid=sk-conv-row]')).toHaveLength(1);
  });

  it('omits the Unfiled node when every conversation is filed', () => {
    renderSidebar(
      makeView({ active: [node(folder('x'))], pinned: [], archived: [] }, {}, {
        conversations: [conv('a', { folderId: 'x' })],
      }),
    );
    expect($('[data-testid=sk-unfiled]')).toBeNull();
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

describe('Sidebar load states (workspace-view-recovery 7.4)', () => {
  const EMPTY: FolderTreeSnapshot = { active: [], pinned: [], archived: [] };

  it('hides the "No folders yet" empty state until a read has succeeded', () => {
    renderSidebar(makeView(EMPTY, {}, { status: 'loading' }));
    expect($('[data-testid=sk-folders-empty]')).toBeNull();
  });

  it('shows the empty state only once a read succeeded and returned no folders', () => {
    renderSidebar(makeView(EMPTY, {}, { status: 'ready' }));
    expect($('[data-testid=sk-folders-empty]')).toBeTruthy();
  });

  it('shows a retry affordance on a failed load, not the empty state', () => {
    const retry = vi.fn();
    renderSidebar(makeView(EMPTY, {}, { status: 'error', retry }));
    expect($('[data-testid=sk-folders-empty]')).toBeNull();
    const retryBtn = $('[data-testid=sk-folders-retry]');
    expect(retryBtn).toBeTruthy();
    retryBtn!.click();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('does not flash a loading indicator before the delay, but shows it on a slow read', async () => {
    renderSidebar(makeView(EMPTY, {}, { status: 'loading' }));
    // Immediately after mount: no spinner (a warm read resolves before the delay).
    expect($('[data-testid=sk-folders-loading]')).toBeNull();
    // A genuinely slow read keeps loading: the spinner appears only after the delay.
    await new Promise((r) => setTimeout(r, 200));
    expect($('[data-testid=sk-folders-loading]')).toBeTruthy();
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

    $('[data-testid=sk-empty-new-folder]')!.click();
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

    $('[data-testid=sk-empty-new-folder]')!.click();
    await new Promise((r) => setTimeout(r, 0));
    type('sk-folder-name', 'Research');
    await flush(); // let setName re-render so the submit handler sees the typed name
    submitForm();
    await flush();

    expect(mutate).toHaveBeenCalledTimes(1);
    expect($('[data-testid=sk-folder-dialog]')).toBeNull();
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
