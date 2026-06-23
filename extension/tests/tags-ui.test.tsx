// tags spec coverage — UI surfaces (happy-dom), revised IA: NO Tags tab. Tags are a
// cross-cutting facet surfaced as (a) an inline filter in the Folders filter row, (b)
// a per-conversation anchored picker, and (c) inline CRUD folded into one shared
// `TagPicker` popover. Maps to the `tags` view requirements + the `sidebar-shell`
// "Tag view-filter control" delta. The worker is never touched (views are injected;
// the pure selectors run directly).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { countByTag, filterByTags } from '../src/core/tags';
import { TagPicker } from '../src/ui/tags/TagPicker';
import { TagFilterChips } from '../src/ui/tags/TagFilterChips';
import type { TagLibraryView } from '../src/ui/tags/useTagLibrary';
import { Sidebar } from '../src/ui/sidebar/Sidebar';
import { SidebarShell } from '../src/ui/sidebar/SidebarShell';
import type { WorkspaceView } from '../src/ui/sidebar/useWorkspace';
import type { ProfileLibraryView } from '../src/ui/profiles/useProfileLibrary';
import type { ConversationIndex, Tag } from '../src/shared/types';
import { SETTINGS_KEY } from '../src/shared/settings';

let container: HTMLElement;
const $ = (sel: string) => container.querySelector(sel) as HTMLElement | null;
const $$ = (sel: string) => [...container.querySelectorAll(sel)] as HTMLElement[];
const flush = () => new Promise((r) => setTimeout(r, 0));

function tag(id: string, label = id, color?: string): Tag {
  return { id, label, ...(color ? { color } : {}), rev: 1, updatedAt: 0, deviceId: 'd', hash: 'h' };
}

function conv(id: string, over: Partial<ConversationIndex> = {}): ConversationIndex {
  return {
    id,
    platform: 'claude',
    nativeId: id,
    title: id,
    folderId: null,
    tags: [],
    indexedText: '',
    contentHash: '',
    updatedAt: 0,
    ...over,
  };
}

function makeWorkspaceView(over: Partial<WorkspaceView> = {}): WorkspaceView {
  return {
    tree: { active: [], pinned: [], archived: [] },
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

function makeTagView(over: Partial<TagLibraryView> = {}): TagLibraryView {
  return {
    tags: [],
    status: 'ready',
    refresh: vi.fn(),
    retry: vi.fn(),
    mutate: vi.fn(async () => ({ ok: true, applied: true })),
    ...over,
  };
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => {
  render(null, container);
  document.body.innerHTML = '';
});

// ---------------------------------------------------------------------------
// Client-side selectors (the single source for filter + counts, design D-4)
// ---------------------------------------------------------------------------

describe('tag selectors (4.6 / 4.7)', () => {
  const list = [
    conv('a', { tags: ['t1'] }),
    conv('b', { tags: ['t1', 't2'] }),
    conv('c', { tags: ['t2'] }),
    conv('d', { tags: [] }),
  ];

  it('filterByTags narrows to a single tag and intersects (AND) for many', () => {
    expect(filterByTags(list, ['t1']).map((c) => c.id)).toEqual(['a', 'b']);
    expect(filterByTags(list, ['t1', 't2']).map((c) => c.id)).toEqual(['b']);
  });

  it('an empty selection is the identity (the unified list)', () => {
    expect(filterByTags(list, [])).toBe(list);
  });

  it('countByTag counts carriers per tag id', () => {
    expect(countByTag(list)).toEqual({ t1: 2, t2: 2 });
  });
});

// ---------------------------------------------------------------------------
// Sidebar tag narrowing + row chips (4.6 / row indicators)
// ---------------------------------------------------------------------------

describe('Sidebar narrows by the tag filter and shows row chips (4.6)', () => {
  const convs = [
    conv('claude::c1', { platform: 'claude', nativeId: 'c1', title: 'Alpha', tags: ['t1'] }),
    conv('claude::c2', { platform: 'claude', nativeId: 'c2', title: 'Beta', tags: ['t1', 't2'] }),
    conv('gemini::g1', { platform: 'gemini', nativeId: 'g1', title: 'Gamma', tags: ['t1'] }),
  ];
  const titles = () => $$('[data-testid=sk-conv-title]').map((n) => n.textContent);

  it('no tag filter renders the unified list (ephemeral default)', () => {
    render(<Sidebar platform="claude" view={makeWorkspaceView({ conversations: convs })} />, container);
    expect(titles().sort()).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('a single selected tag narrows; two intersect (AND)', () => {
    render(<Sidebar platform="claude" view={makeWorkspaceView({ conversations: convs, tagFilter: ['t2'] })} />, container);
    expect(titles()).toEqual(['Beta']);
    render(null, container);
    render(<Sidebar platform="claude" view={makeWorkspaceView({ conversations: convs, tagFilter: ['t1', 't2'] })} />, container);
    expect(titles()).toEqual(['Beta']);
  });

  it('composes with the platform filter', () => {
    render(
      <Sidebar platform="claude" view={makeWorkspaceView({ conversations: convs, tagFilter: ['t1'], platformFilter: 'gemini' })} />,
      container,
    );
    expect(titles()).toEqual(['Gamma']);
  });

  it('renders assigned tags as labelled chips on the row', () => {
    render(
      <Sidebar
        platform="claude"
        tags={[tag('t1', 'Research'), tag('t2', 'Personal')]}
        view={makeWorkspaceView({ conversations: [conv('claude::c2', { nativeId: 'c2', title: 'Beta', tags: ['t1', 't2'] })] })}
      />,
      container,
    );
    const chips = $('[data-testid=sk-conv-row-tags]')!;
    expect(chips).toBeTruthy();
    expect(chips.textContent).toContain('Research');
    expect(chips.textContent).toContain('Personal');
  });
});

// ---------------------------------------------------------------------------
// TagFilterChips — inline filter + opening the shared picker (4.8)
// ---------------------------------------------------------------------------

describe('TagFilterChips (4.8)', () => {
  const tags = [tag('t1', 'Research', '#5aa9e6'), tag('t2', 'Personal')];

  it('renders a live tag affordance and selected tags as removable chips', () => {
    const onChange = vi.fn();
    render(<TagFilterChips tags={tags} selected={['t1']} onChange={onChange} mutate={vi.fn()} />, container);
    const add = $('[data-testid=sk-tag-add]') as HTMLButtonElement;
    expect(add.disabled).toBe(false);
    const chip = $('[data-testid=sk-tag-chip-t1]') as HTMLButtonElement;
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    expect(chip.querySelector('.sk-tag-dot')!.getAttribute('style')).toContain('#5aa9e6');
    chip.click();
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('opens the picker; choosing a tag toggles the selection', async () => {
    const onChange = vi.fn();
    render(<TagFilterChips tags={tags} selected={[]} onChange={onChange} mutate={vi.fn()} />, container);
    expect($('[data-testid=sk-tag-popover]')).toBeNull();
    ($('[data-testid=sk-tag-add]') as HTMLButtonElement).click();
    await flush();
    expect($('[data-testid=sk-tag-popover]')).toBeTruthy();
    ($('[data-testid=sk-tag-opt-t1]') as HTMLButtonElement).click();
    expect(onChange).toHaveBeenCalledWith(['t1']);
  });
});

// ---------------------------------------------------------------------------
// TagPicker — inline CRUD folded into the picker (no tab / no modal) + counts
// ---------------------------------------------------------------------------

describe('TagPicker inline management (4.7)', () => {
  function mountPicker(over: Partial<Parameters<typeof TagPicker>[0]> = {}) {
    const anchor = document.createElement('button');
    container.appendChild(anchor);
    const props = {
      anchor,
      label: 'Filter by tag',
      tags: [tag('t1', 'Research'), tag('t2', 'Personal')],
      selected: [] as string[],
      onToggle: vi.fn(),
      mutate: vi.fn(async () => ({ ok: true, applied: true })),
      counts: { t1: 3 },
      onClose: vi.fn(),
      ...over,
    };
    render(<TagPicker {...props} />, container);
    return props;
  }

  it('shows a live count next to each tag (equals carriers)', () => {
    mountPicker();
    const row = $$('[data-testid=sk-tag-opt]').find((r) => r.dataset.tagId === 't1')!;
    expect(row.querySelector('[data-testid=sk-tag-count]')!.textContent).toBe('3');
  });

  it('a tag exposes rename / recolor / delete via inline edit', async () => {
    mountPicker();
    ($('[data-testid=sk-tag-manage-t1]') as HTMLButtonElement).click();
    await flush();
    expect($('[data-testid=sk-tag-edit]')).toBeTruthy();
    expect($('[data-testid=sk-tag-name]')).toBeTruthy(); // rename
    expect($('[data-testid=sk-tag-colors]')).toBeTruthy(); // recolor
    expect($('[data-testid=sk-tag-delete]')).toBeTruthy(); // delete
  });

  it('"+ New tag" creates through the worker', async () => {
    const mutate = vi.fn(async () => ({ ok: true, applied: true }));
    mountPicker({ mutate });
    ($('[data-testid=sk-tag-new]') as HTMLButtonElement).click();
    await flush();
    const input = $('[data-testid=sk-tag-name]') as HTMLInputElement;
    input.value = 'Urgent';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    $('[data-testid=sk-tag-edit]')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ op: 'tag.create', label: 'Urgent' }));
  });

  it('a create blocked by the tier quota shows the nudge without losing the typed label (3.7)', async () => {
    const mutate = vi.fn(async () => ({
      ok: false,
      applied: false,
      error: { code: 'quota_exceeded', message: 'x', detail: { resource: 'tags', count: 10, limit: 10 } },
    }));
    mountPicker({ tags: [], mutate });
    ($('[data-testid=sk-tag-new]') as HTMLButtonElement).click();
    await flush();
    const input = $('[data-testid=sk-tag-name]') as HTMLInputElement;
    input.value = 'Overflow';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    $('[data-testid=sk-tag-edit]')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    expect($('[data-testid=sk-tag-quota-nudge]')).toBeTruthy();
    expect(($('[data-testid=sk-tag-name]') as HTMLInputElement).value).toBe('Overflow');
  });
});

// ---------------------------------------------------------------------------
// Conversation-row tag assignment — anchored picker (no centered modal) (3.6)
// ---------------------------------------------------------------------------

describe('conversation-row tag assignment (3.6)', () => {
  it('⋯ → Tags opens an anchored picker that toggles conversation.tag', async () => {
    const mutate = vi.fn(async () => ({ ok: true, applied: true }));
    render(
      <Sidebar
        platform="claude"
        tags={[tag('t1', 'Research')]}
        view={makeWorkspaceView({ conversations: [conv('claude::c1', { nativeId: 'c1', title: 'Alpha' })], mutate })}
      />,
      container,
    );
    const row = $('[data-testid=sk-conv-row]')!;
    (row.querySelector('[data-testid=sk-conv-menu]') as HTMLElement).click();
    await flush();
    ($('[data-testid=sk-conv-menu-tags]') as HTMLElement).click();
    await flush();
    // An anchored popover (NOT a centered modal/dialog).
    expect($('[data-testid=sk-tag-popover]')).toBeTruthy();
    ($('[data-testid=sk-tag-opt-t1]') as HTMLButtonElement).click();
    expect(mutate).toHaveBeenCalledWith({ op: 'conversation.tag', id: 'claude::c1', tagId: 't1', assigned: true });
  });
});

// ---------------------------------------------------------------------------
// SidebarShell IA — NO Tags tab; tag filter is Folders-tab only (4.8)
// ---------------------------------------------------------------------------

describe('SidebarShell tag IA (4.8)', () => {
  const profileView: ProfileLibraryView = {
    profiles: [],
    status: 'ready',
    refresh: vi.fn(),
    retry: vi.fn(),
    mutate: vi.fn(async () => ({ ok: true, applied: true })),
  };
  const originalChrome = (globalThis as { chrome?: unknown }).chrome;
  beforeEach(() => {
    (globalThis as { chrome?: unknown }).chrome = {
      runtime: {
        sendMessage: async () => undefined,
        onMessage: { addListener: () => {}, removeListener: () => {} },
        openOptionsPage: () => {},
        lastError: undefined,
      },
      tabs: { query: async () => [], sendMessage: async () => {} },
      storage: {
        local: { async get() { return { [SETTINGS_KEY]: {} }; }, async set() {} },
        onChanged: { addListener: () => {}, removeListener: () => {} },
      },
    };
  });
  afterEach(() => {
    (globalThis as { chrome?: unknown }).chrome = originalChrome;
  });

  const mount = async (tagView: TagLibraryView) => {
    render(
      <SidebarShell platform="claude" view={makeWorkspaceView()} profileView={profileView} tagView={tagView} />,
      container,
    );
    await flush();
  };

  it('does not render a Tags tab (tags are a facet, not a section)', async () => {
    await mount(makeTagView({ tags: [tag('t1', 'Research')] }));
    expect($('[data-testid=sk-tab-tags]')).toBeNull();
    expect($('[data-testid=sk-tab-folders]')).toBeTruthy();
    expect($('[data-testid=sk-tab-profiles]')).toBeTruthy();
  });

  it('shows the tag filter affordance inline under Folders and hides it on Prompts', async () => {
    await mount(makeTagView({ tags: [tag('t1', 'Research')] }));
    // Inline in the one platform/tag filter row — no second row.
    expect($('[data-testid=sk-platforms] [data-testid=sk-tag-add]')).toBeTruthy();
    ($('[data-testid=sk-tab-prompts]') as HTMLButtonElement).click();
    await flush();
    expect($('[data-testid=sk-tag-add]')).toBeNull();
  });
});
