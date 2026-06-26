// conversation-filing — the inline conversation list (happy-dom). Renders the
// list directly with a node-scoped set of conversations (no worker). The list is
// the contents of one folder (or the Unfiled node): the per-row menu files through
// the picker, the active-tab conversation is highlighted, a row emits a
// `conversation` drag payload, and every drag action has a keyboard path.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import {
  ConversationList,
  archivedConversations,
  nonArchivedConversations,
  sortConversations,
  type ConversationListContext,
} from '../src/ui/sidebar/ConversationList';
import { DRAG_MIME } from '../src/ui/sidebar/drag';
import type { MutateResult } from '../src/ui/sidebar/useWorkspace';
import type { ActiveConversation, ConversationIndex, Folder, FolderTreeNode } from '../src/shared/types';
import { conversationId, type FolderTreeSnapshot, type MutationOp } from '../src/shared/workspace';

function folder(id: string, over: Partial<Folder> = {}): Folder {
  return { id, name: id, parentId: null, platformScope: 'unified', order: 0, rev: 1, updatedAt: 0, deviceId: 'd', hash: 'h', ...over };
}
const node = (f: Folder): FolderTreeNode => ({ folder: f, depth: 1, children: [] });
const TREE: FolderTreeSnapshot = { active: [node(folder('work', { name: 'Work' }))], pinned: [], archived: [] };

function conv(id: string, over: Partial<ConversationIndex> = {}): ConversationIndex {
  return { id, platform: 'claude', nativeId: id, title: id, folderId: 'work', tags: [], indexedText: '', contentHash: '', updatedAt: 0, ...over };
}

const FOLDER_CTX: ConversationListContext = { kind: 'folder', name: 'Work' };

let container: HTMLElement | null = null;
function renderList(
  conversations: ConversationIndex[],
  opts: {
    active?: ActiveConversation | null;
    mutate?: (op: MutationOp) => Promise<MutateResult>;
    context?: ConversationListContext;
    onOpen?: (conv: ConversationIndex) => void;
  } = {},
) {
  container = document.createElement('div');
  document.body.appendChild(container);
  render(
    <ConversationList
      conversations={conversations}
      active={opts.active ?? null}
      tree={TREE}
      mutate={opts.mutate ?? (vi.fn(async () => ({ ok: true, applied: true })) as never)}
      context={opts.context ?? FOLDER_CTX}
      onOpen={opts.onOpen}
    />,
    container,
  );
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

describe('ConversationList rendering (4.1)', () => {
  it('renders a row per conversation with its title', () => {
    renderList([conv('a', { title: 'Alpha' }), conv('b', { title: 'Beta' })]);
    const rows = $$('[data-testid=sk-conv-row]');
    expect(rows).toHaveLength(2);
    const alpha = rows.find((r) => r.dataset.conversationId === 'a')!;
    expect(alpha.querySelector('[data-testid=sk-conv-title]')!.textContent).toBe('Alpha');
  });

  it('highlights the active-tab conversation (aria-current)', () => {
    const active: ActiveConversation = { platform: 'claude', nativeId: 'a', title: 'Alpha', updatedAt: 1 };
    renderList([conv(conversationId('claude', 'a'), { nativeId: 'a', title: 'Alpha' }), conv('b', { title: 'Beta' })], { active });
    const rows = $$('[data-testid=sk-conv-row]');
    const activeRow = rows.find((r) => r.getAttribute('aria-current') === 'true')!;
    expect(activeRow).toBeTruthy();
    expect(activeRow.classList.contains('sk-conv-row--active')).toBe(true);
    expect(activeRow.querySelector('[data-testid=sk-conv-title]')!.textContent).toBe('Alpha');
    // exactly one row is marked current
    expect(rows.filter((r) => r.getAttribute('aria-current') === 'true')).toHaveLength(1);
  });

  it('shows a folder empty state when the node has no conversations', () => {
    renderList([]);
    expect($('[data-testid=sk-conv-empty]')!.textContent).toContain('Nothing here yet');
  });

  it('shows the unfiled empty copy for the Unfiled node', () => {
    renderList([], { context: { kind: 'unfiled' } });
    expect($('[data-testid=sk-conv-empty]')!.textContent).toContain('No uncategorized conversations');
  });

  it('pages the rendered rows and reveals more on demand (no silent truncation)', async () => {
    const many = Array.from({ length: 120 }, (_, i) => conv(`c${i}`, { title: `Chat ${i}`, updatedAt: i }));
    renderList(many);
    // First page only, and the hidden remainder is offered (never silently dropped).
    expect($$('[data-testid=sk-conv-row]')).toHaveLength(50);
    const more = $('[data-testid=sk-conv-more]');
    expect(more).toBeTruthy();
    expect(more!.textContent).toContain('70'); // 120 - 50 still hidden

    // Revealing pages in the next batch and updates the remaining count.
    more!.click();
    await flush();
    expect($$('[data-testid=sk-conv-row]')).toHaveLength(100);
    expect($('[data-testid=sk-conv-more]')!.textContent).toContain('20');

    // A final reveal exhausts the list and retires the control.
    $('[data-testid=sk-conv-more]')!.click();
    await flush();
    expect($$('[data-testid=sk-conv-row]')).toHaveLength(120);
    expect($('[data-testid=sk-conv-more]')).toBeNull();
  });

  it('groups a long list under relative-date overlines, but leaves short lists flat', () => {
    const now = Date.now();
    const recent = Array.from({ length: 14 }, (_, i) =>
      conv(`r${i}`, { title: `Recent ${i}`, updatedAt: now - i * 1000 }),
    );
    renderList(recent);
    // 14 rows (> GROUP_MIN) all from today → a single TODAY overline, no OLDER bucket.
    expect($('[data-testid=sk-conv-group-today]')).toBeTruthy();
    expect($('[data-testid=sk-conv-group-older]')).toBeNull();

    // A short list stays flat — no overlines.
    renderList(recent.slice(0, 4));
    expect($('[data-testid=sk-conv-group-today]')).toBeNull();
  });

  it('leads a grouped list with a Pinned overline above the date buckets', () => {
    const now = Date.now();
    const rows = [
      conv('p', { title: 'Pinned one', pinned: true, updatedAt: now - 30 * 86_400_000 }),
      ...Array.from({ length: 13 }, (_, i) => conv(`c${i}`, { updatedAt: now - i * 1000 })),
    ];
    renderList(rows);
    const pinnedLabel = $('[data-testid=sk-conv-group-pinned]');
    expect(pinnedLabel).toBeTruthy();
    // The pinned row sorts under the Pinned overline, not its 30-day-old date bucket.
    const labels = $$('.sk-conv-group-label').map((l) => l.dataset.testid);
    expect(labels[0]).toBe('sk-conv-group-pinned');
  });
});

describe('ConversationList archived context', () => {
  const ARCHIVED_CTX: ConversationListContext = { kind: 'archived' };

  it('renders only archived rows (recent-first) and hides non-archived ones', () => {
    renderList(
      [
        conv('live', { title: 'Live', archived: false, updatedAt: 9 }),
        conv('old-arc', { title: 'Old archived', archived: true, updatedAt: 1 }),
        conv('new-arc', { title: 'New archived', archived: true, updatedAt: 5 }),
      ],
      { context: ARCHIVED_CTX },
    );
    const ids = $$('[data-testid=sk-conv-row]').map((r) => r.dataset.conversationId);
    // Archived only, recent-first; the non-archived 'live' row is hidden.
    expect(ids).toEqual(['new-arc', 'old-arc']);
  });

  it('shows the archived empty copy when there are no archived conversations', () => {
    renderList([conv('a', { archived: false })], { context: ARCHIVED_CTX });
    expect($('[data-testid=sk-conv-row]')).toBeNull();
    expect($('[data-testid=sk-conv-empty]')!.textContent).toContain('No archived conversations');
  });
});

describe('ConversationList open', () => {
  it('activating a row opens that conversation in the active tab', () => {
    const onOpen = vi.fn();
    renderList([conv('a', { title: 'Alpha' }), conv('b', { title: 'Beta' })], { onOpen });
    const alpha = $$('[data-testid=sk-conv-row]').find((r) => r.dataset.conversationId === 'a')!;
    (alpha.querySelector('[data-testid=sk-conv-open]') as HTMLElement).click();
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0][0]).toMatchObject({ id: 'a', title: 'Alpha' });
  });

  it('the open control is a real button (keyboard-operable)', () => {
    renderList([conv('a', { title: 'Alpha' })]);
    expect(($('[data-testid=sk-conv-open]') as HTMLElement).tagName).toBe('BUTTON');
  });

  it('opening the context menu does not open the conversation', async () => {
    const onOpen = vi.fn();
    renderList([conv('a', { title: 'Alpha' })], { onOpen });
    $('[data-testid=sk-conv-menu]')!.click();
    await flush();
    expect(onOpen).not.toHaveBeenCalled();
  });
});

describe('ConversationList sort/hide helpers (3.1, 3.3)', () => {
  it('hides archived conversations and keeps the rest', () => {
    const kept = nonArchivedConversations([
      conv('a'),
      conv('b', { archived: true }),
      conv('c', { archived: false }),
    ]);
    expect(kept.map((c) => c.id)).toEqual(['a', 'c']);
  });

  it('sorts pinned above unpinned, most-recent-first within each group', () => {
    const ordered = sortConversations([
      conv('old', { updatedAt: 1 }),
      conv('new', { updatedAt: 3 }),
      conv('pin-old', { pinned: true, updatedAt: 1 }),
      conv('pin-new', { pinned: true, updatedAt: 2 }),
    ]);
    expect(ordered.map((c) => c.id)).toEqual(['pin-new', 'pin-old', 'new', 'old']);
  });

  it('does not mutate the input array', () => {
    const input = [conv('a', { updatedAt: 1 }), conv('b', { updatedAt: 2 })];
    sortConversations(input);
    expect(input.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('archivedConversations keeps only archived conversations', () => {
    const kept = archivedConversations([
      conv('a'),
      conv('b', { archived: true }),
      conv('c', { archived: false }),
      conv('d', { archived: true }),
    ]);
    expect(kept.map((c) => c.id)).toEqual(['b', 'd']);
  });
});

describe('ConversationList list reflects pin/archive (3.2)', () => {
  it('renders pinned rows above unpinned and excludes archived', () => {
    renderList([
      conv('a', { title: 'Alpha', updatedAt: 5 }),
      conv('z', { title: 'Zeta', archived: true, updatedAt: 9 }),
      conv('p', { title: 'Pinned', pinned: true, updatedAt: 1 }),
    ]);
    const ids = $$('[data-testid=sk-conv-row]').map((r) => r.dataset.conversationId);
    expect(ids).toEqual(['p', 'a']); // pinned first, archived 'z' hidden
  });

  it('leads each row with its platform brand logo (no colour dot)', () => {
    renderList([conv('a', { platform: 'claude' }), conv('b', { platform: 'gemini' })]);
    const rows = $$('[data-testid=sk-conv-row]');
    for (const row of rows) {
      const logo = row.querySelector('[data-testid=sk-conv-logo]')!;
      expect(logo).toBeTruthy();
      expect(logo.querySelector('svg')).toBeTruthy();
      // The retired per-conversation colour dot is gone.
      expect(row.querySelector('.sk-conv-row__dot')).toBeNull();
    }
  });

  it('renders a pin badge on a pinned row only (not on unpinned rows)', () => {
    renderList([
      conv('p', { title: 'Pinned', pinned: true }),
      conv('u', { title: 'Unpinned' }),
    ]);
    const rows = $$('[data-testid=sk-conv-row]');
    const pinned = rows.find((r) => r.dataset.conversationId === 'p')!;
    const unpinned = rows.find((r) => r.dataset.conversationId === 'u')!;
    const badge = pinned.querySelector('[data-testid=sk-conv-pinned]')!;
    expect(badge).toBeTruthy();
    expect(badge.getAttribute('aria-label')).toBe('Pinned');
    expect(badge.querySelector('svg')).toBeTruthy();
    expect(unpinned.querySelector('[data-testid=sk-conv-pinned]')).toBeNull();
  });
});

describe('ConversationList context menu (4.1–4.3, 5.1)', () => {
  const openMenu = async (rowId = 'a') => {
    const row = $$('[data-testid=sk-conv-row]').find((r) => r.dataset.conversationId === rowId)!;
    (row.querySelector('[data-testid=sk-conv-menu]') as HTMLElement).click();
    await flush();
  };

  it('opens a menu listing Move / Pin / Archive, with no colours, Rename or Delete', async () => {
    renderList([conv('a', { title: 'Alpha' })]);
    await openMenu();
    const menu = $('[data-testid=sk-conv-context-menu]');
    expect(menu).toBeTruthy();
    expect($('[data-testid=sk-conv-menu-move]')).toBeTruthy();
    expect($('[data-testid=sk-conv-menu-pin]')!.textContent).toBe('Pin to top');
    expect($('[data-testid=sk-conv-menu-archive]')!.textContent).toBe('Archive');
    // The colour affordance is retired from the row menu.
    expect($$('[data-testid=sk-conv-color]')).toHaveLength(0);
    expect($('[data-testid=sk-conv-color-clear]')).toBeNull();
    expect(menu!.textContent).not.toContain('Rename');
    expect(menu!.textContent).not.toContain('Delete');
  });

  it('reflects pinned state in the action label (pinned → Unpin)', async () => {
    renderList([conv('a', { title: 'Alpha', pinned: true })]);
    await openMenu();
    expect($('[data-testid=sk-conv-menu-pin]')!.textContent).toBe('Unpin');
  });

  it('Pin issues a pin mutation toggling the current state', async () => {
    const mutate = vi.fn(async () => ({ ok: true, applied: true }));
    renderList([conv('a', { title: 'Alpha' })], { mutate });
    await openMenu();
    ($('[data-testid=sk-conv-menu-pin]') as HTMLElement).click();
    await flush();
    expect(mutate).toHaveBeenCalledWith({ op: 'conversation.pin', conversationId: 'a', pinned: true });
  });

  it('Archive issues an archive mutation', async () => {
    const mutate = vi.fn(async () => ({ ok: true, applied: true }));
    renderList([conv('a', { title: 'Alpha' })], { mutate });
    await openMenu();
    ($('[data-testid=sk-conv-menu-archive]') as HTMLElement).click();
    await flush();
    expect(mutate).toHaveBeenCalledWith({ op: 'conversation.archive', conversationId: 'a', archived: true });
  });

});

describe('ConversationList filing (4.2, 4.6)', () => {
  it('the menu Move to… action opens the picker and files via it', async () => {
    const mutate = vi.fn(async () => ({ ok: true, applied: true }));
    renderList([conv('a', { title: 'Alpha', folderId: null })], { mutate });

    const row = $$('[data-testid=sk-conv-row]').find((r) => r.dataset.conversationId === 'a')!;
    (row.querySelector('[data-testid=sk-conv-menu]') as HTMLElement).click();
    await flush();
    ($('[data-testid=sk-conv-menu-move]') as HTMLElement).click();
    await flush();
    expect($('[data-testid=sk-move-picker]')).toBeTruthy();

    ($('[data-testid=sk-move-option]') as HTMLElement).click();
    await flush();
    expect(mutate).toHaveBeenCalledWith({ op: 'conversation.assign', conversationId: 'a', folderId: 'work' });
    expect($('[data-testid=sk-move-picker]')).toBeNull();
  });
});

describe('ConversationList drag (4.3, 4.6)', () => {
  it('a row emits a conversation drag payload the folder drop handler understands', () => {
    renderList([conv('a', { title: 'Alpha' })]);
    const row = $('[data-testid=sk-conv-row]')!;
    // happy-dom's DataTransfer is a no-op for setData/getData, so use a stub that
    // records what the handler writes (the same payload the real browser carries).
    const store: Record<string, string> = {};
    const dt = { setData: (k: string, v: string) => void (store[k] = v), getData: (k: string) => store[k] ?? '' };
    // Under happy-dom Preact binds the listener as `DragStart` (because
    // `'ondragstart' in element` is false), so dispatch that name; the real
    // lowercase `dragstart` → drop → assign path is exercised by the E2E (5.2).
    const ev = new Event('DragStart', { bubbles: true });
    Object.defineProperty(ev, 'dataTransfer', { value: dt });
    row.dispatchEvent(ev);
    expect(JSON.parse(store[DRAG_MIME])).toEqual({ type: 'conversation', id: 'a' });
  });
});
