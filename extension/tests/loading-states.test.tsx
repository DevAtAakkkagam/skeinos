// loading-states feature (happy-dom): the Skeleton primitive, the sidebar body
// load-state matrix, the useIndexProgress subscription hook, and the
// IndexingIndicator banner. Runs without the worker/IndexedDB via the injectable
// `view` seam and a mocked `subscribe`.
//
//   4.1 Skeleton primitive — structure, variant class, aria-hidden, size overrides
//   4.2 Sidebar body states — loading / ready-empty / ready-folders / error
//   4.3 useIndexProgress — surface in-flight, clear on empty/complete, ignore other
//       broadcasts, dispose on unmount
//   4.4 IndexingIndicator — count + percent + progressbar aria, hidden on null,
//       hook-driven appear/disappear, non-blocking (in normal flow)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';

// The hook subscribes via `subscribe()` from core/messaging — mock it so a test can
// capture the handler and push `index.progress` broadcasts at it (mirrors
// useworkspace-recovery.test.tsx). The whole module is mocked, so any other export
// the Sidebar tree pulls in is stubbed too; the Sidebar here is driven purely by its
// injectable `view`, so it never touches the real messaging client.
vi.mock('../src/core/messaging', () => ({ subscribe: vi.fn(() => () => undefined) }));

import { subscribe } from '../src/core/messaging';
import { Skeleton } from '../src/ui/components/Skeleton';
import { Sidebar } from '../src/ui/sidebar/Sidebar';
import { useIndexProgress } from '../src/ui/sidebar/useIndexProgress';
import { IndexingIndicator } from '../src/ui/sidebar/IndexingIndicator';
import type { WorkspaceView } from '../src/ui/sidebar/useWorkspace';
import type { Folder, FolderTreeNode } from '../src/shared/types';
import type { FolderTreeSnapshot } from '../src/shared/workspace';
import type { Broadcast } from '../src/shared/messages';

// --- shared harness ---------------------------------------------------------
let container: HTMLElement | null = null;
function mountNode(node: preact.ComponentChild): HTMLElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  render(node as never, container);
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
  vi.mocked(subscribe).mockReset();
  vi.mocked(subscribe).mockImplementation(() => () => undefined);
});

// --- sidebar view builders (mirrors sidebar.test.tsx) -----------------------
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
function makeView(tree: FolderTreeSnapshot, over: Partial<WorkspaceView> = {}): WorkspaceView {
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
const renderSidebar = (view: WorkspaceView) => mountNode(<Sidebar platform="claude" view={view} />);
const EMPTY: FolderTreeSnapshot = { active: [], pinned: [], archived: [] };

// =========================================================================== //
// 4.1 Skeleton primitive
// =========================================================================== //
describe('Skeleton primitive (loading-states 4.1)', () => {
  it('renders the testid span, hidden from assistive tech', () => {
    mountNode(<Skeleton />);
    const el = $('[data-testid=sk-skeleton]')!;
    expect(el).toBeTruthy();
    expect(el.tagName).toBe('SPAN');
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });

  it('defaults to the line variant and carries the base class', () => {
    mountNode(<Skeleton />);
    const el = $('[data-testid=sk-skeleton]')!;
    expect(el.classList.contains('sk-skeleton')).toBe(true);
    expect(el.classList.contains('sk-skeleton--line')).toBe(true);
  });

  it('applies the requested variant class (row / block)', () => {
    mountNode(<Skeleton variant="row" />);
    expect($('[data-testid=sk-skeleton]')!.classList.contains('sk-skeleton--row')).toBe(true);
    render(null, container!);
    render(<Skeleton variant="block" />, container!);
    expect($('[data-testid=sk-skeleton]')!.classList.contains('sk-skeleton--block')).toBe(true);
  });

  it('honours explicit width/height overrides via inline style', () => {
    mountNode(<Skeleton variant="line" width="40%" height="14px" />);
    const el = $('[data-testid=sk-skeleton]')!;
    expect(el.style.width).toBe('40%');
    expect(el.style.height).toBe('14px');
  });

  it('merges a caller class alongside the variant class', () => {
    mountNode(<Skeleton class="my-tweak" />);
    const el = $('[data-testid=sk-skeleton]')!;
    expect(el.classList.contains('sk-skeleton')).toBe(true);
    expect(el.classList.contains('sk-skeleton--line')).toBe(true);
    expect(el.classList.contains('my-tweak')).toBe(true);
  });
});

// =========================================================================== //
// 4.2 Sidebar body states
// =========================================================================== //
describe('Sidebar body load states (loading-states 4.2)', () => {
  it('loading + no folders → skeleton rows, not the empty state', () => {
    renderSidebar(makeView(EMPTY, { status: 'loading' }));
    expect($('[data-testid=sk-folders-skeleton]')).toBeTruthy();
    expect($('[data-testid=sk-folders-empty]')).toBeNull();
  });

  it('ready + no folders → the empty state, not the skeleton', () => {
    renderSidebar(makeView(EMPTY, { status: 'ready' }));
    expect($('[data-testid=sk-folders-empty]')).toBeTruthy();
    expect($('[data-testid=sk-folders-skeleton]')).toBeNull();
  });

  it('ready + folders → the tree rows, no skeleton', () => {
    renderSidebar(
      makeView({ active: [node(folder('x', { name: 'Research' }))], pinned: [], archived: [] }, { status: 'ready' }),
    );
    expect($$('[data-testid=sk-folder]')).toHaveLength(1);
    expect($('[data-testid=sk-folders-skeleton]')).toBeNull();
    expect($('[data-testid=sk-folders-empty]')).toBeNull();
  });

  it('error → a retry affordance, no skeleton and no empty state', () => {
    const retry = vi.fn();
    renderSidebar(makeView(EMPTY, { status: 'error', retry }));
    expect($('[data-testid=sk-folders-retry]')).toBeTruthy();
    expect($('[data-testid=sk-folders-skeleton]')).toBeNull();
    expect($('[data-testid=sk-folders-empty]')).toBeNull();
    $('[data-testid=sk-folders-retry]')!.click();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('the loading skeleton container is built of skeleton primitives', () => {
    renderSidebar(makeView(EMPTY, { status: 'loading' }));
    const skel = $('[data-testid=sk-folders-skeleton]')!;
    expect(skel.querySelectorAll('[data-testid=sk-skeleton]').length).toBeGreaterThan(0);
    // It announces itself as a status region while loading.
    expect(skel.getAttribute('role')).toBe('status');
  });
});

// =========================================================================== //
// 4.3 useIndexProgress
// =========================================================================== //
describe('useIndexProgress (loading-states 4.3)', () => {
  // Capture the broadcast handler the hook registers, and a dispose spy the hook
  // must call on unmount.
  let handler: ((msg: Broadcast) => void) | null = null;
  const disposeSpy = vi.fn();

  let latest: ReturnType<typeof useIndexProgress> | undefined;
  function Probe() {
    latest = useIndexProgress();
    return <div data-testid="probe" data-value={latest ? `${latest.done}/${latest.total}` : 'null'} />;
  }

  beforeEach(() => {
    handler = null;
    disposeSpy.mockReset();
    vi.mocked(subscribe).mockImplementation((h) => {
      handler = h;
      return disposeSpy;
    });
  });

  const read = () => container!.querySelector('[data-testid=probe]')!.getAttribute('data-value');
  // Push a broadcast and let Preact's effect/state flush.
  const push = async (msg: Broadcast) => {
    handler!(msg);
    await flush();
  };

  it('surfaces an in-flight broadcast as { done, total }', async () => {
    mountNode(<Probe />);
    await flush();
    await push({ kind: 'index.progress', done: 3, total: 10 });
    expect(read()).toBe('3/10');
    expect(latest).toEqual({ done: 3, total: 10 });
  });

  it('returns null when nothing is indexing (total 0)', async () => {
    mountNode(<Probe />);
    await flush();
    await push({ kind: 'index.progress', done: 0, total: 0 });
    expect(read()).toBe('null');
    expect(latest).toBeNull();
  });

  it('clears on completion (done === total)', async () => {
    mountNode(<Probe />);
    await flush();
    await push({ kind: 'index.progress', done: 4, total: 10 });
    expect(read()).toBe('4/10');
    await push({ kind: 'index.progress', done: 10, total: 10 });
    expect(read()).toBe('null');
    expect(latest).toBeNull();
  });

  it('ignores broadcasts that are not index.progress', async () => {
    mountNode(<Probe />);
    await flush();
    await push({ kind: 'index.progress', done: 2, total: 8 });
    expect(read()).toBe('2/8');
    // A state.changed broadcast must not disturb the held progress.
    await push({ kind: 'state.changed', stores: [] });
    expect(read()).toBe('2/8');
  });

  it('disposes its subscription on unmount', async () => {
    mountNode(<Probe />);
    await flush();
    expect(disposeSpy).not.toHaveBeenCalled();
    render(null, container!);
    await flush();
    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });
});

// =========================================================================== //
// 4.4 IndexingIndicator
// =========================================================================== //
describe('IndexingIndicator (loading-states 4.4)', () => {
  it('renders the banner with count, percent, and progressbar aria from an override', () => {
    mountNode(<IndexingIndicator progress={{ done: 5, total: 20 }} />);
    const banner = $('[data-testid=sk-indexing]')!;
    expect(banner).toBeTruthy();
    expect(banner.getAttribute('role')).toBe('status');
    // Label mentions the total conversation count.
    expect(banner.textContent).toContain('20');
    // 5/20 → 25%.
    expect($('[data-testid=sk-indexing-pct]')!.textContent).toBe('25%');

    const bar = banner.querySelector('[role=progressbar]')!;
    expect(bar.getAttribute('aria-valuenow')).toBe('5');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('20');
  });

  it('renders nothing when progress is null', () => {
    mountNode(<IndexingIndicator progress={null} />);
    expect($('[data-testid=sk-indexing]')).toBeNull();
  });

  it('appears on an in-flight hook broadcast and disappears on completion', async () => {
    let handler: ((msg: Broadcast) => void) | null = null;
    vi.mocked(subscribe).mockImplementation((h) => {
      handler = h;
      return () => undefined;
    });
    // No override → driven by the live hook.
    mountNode(<IndexingIndicator />);
    await flush();
    // Idle: nothing rendered.
    expect($('[data-testid=sk-indexing]')).toBeNull();

    handler!({ kind: 'index.progress', done: 2, total: 8 });
    await flush();
    expect($('[data-testid=sk-indexing]')).toBeTruthy();
    expect($('[data-testid=sk-indexing-pct]')!.textContent).toBe('25%');

    // Completion → the hook clears, the indicator removes itself.
    handler!({ kind: 'index.progress', done: 8, total: 8 });
    await flush();
    expect($('[data-testid=sk-indexing]')).toBeNull();
  });

  it('is non-blocking: in normal flow with no modal/backdrop and inline position', () => {
    // A sibling beside the banner stays queryable (no overlay swallows the flow),
    // and the banner uses no fixed/overlay positioning at the markup level.
    mountNode(
      <div>
        <IndexingIndicator progress={{ done: 1, total: 4 }} />
        <button data-testid="sibling">After the banner</button>
      </div>,
    );
    const banner = $('[data-testid=sk-indexing]')!;
    expect(banner).toBeTruthy();
    // The sibling is still reachable — the indicator did not capture the layout.
    expect($('[data-testid=sibling]')).toBeTruthy();
    // No modal/backdrop and no inline fixed positioning.
    expect($('[data-testid=sk-backdrop]')).toBeNull();
    expect($('.sk-modal')).toBeNull();
    expect(banner.style.position).not.toBe('fixed');
  });
});
