// workspace-view-recovery: the hook's honest load-status machine and
// observe-don't-replay mutate. Driven through a probe component with the folders
// client + broadcast subscription mocked, so it runs without the worker.
//
//   7.1 status: loading→ready, loading→error, error→ready (retry)
//   7.2 observe-don't-replay: lost-ack mutation whose re-read shows the change
//       renders it, and the mutation is sent exactly once
//   7.3 a mutation that reconciles to no-change reports failure (not swallowed)
//   7.6 visibilitychange→visible and window focus each trigger a reconcile read

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import type { WorkspaceSelector, WorkspaceSnapshot, MutationOp } from '../src/shared/workspace';
import type { Response } from '../src/shared/messages';
import type { Folder, FolderTreeNode, PlatformId } from '../src/shared/types';

vi.mock('../src/core/folders', () => ({
  queryWorkspaceRemote: vi.fn(),
  mutateWorkspaceRemote: vi.fn(),
}));
vi.mock('../src/core/messaging', () => ({ subscribe: vi.fn(() => () => undefined) }));

import { queryWorkspaceRemote, mutateWorkspaceRemote } from '../src/core/folders';
import { useWorkspace, type WorkspaceView } from '../src/ui/sidebar/useWorkspace';

const mockQuery = vi.mocked(queryWorkspaceRemote);
const mockMutate = vi.mocked(mutateWorkspaceRemote);

// --- response builders ------------------------------------------------------
function folder(id: string): Folder {
  return { id, name: id, parentId: null, platformScope: 'unified', order: 0, rev: 1, updatedAt: 0, deviceId: 'd', hash: 'h' };
}
const node = (f: Folder): FolderTreeNode => ({ folder: f, depth: 1, children: [] });
const treeSnap = (ids: string[]): Response<WorkspaceSnapshot> => ({
  ok: true,
  data: { kind: 'folder.tree', tree: { active: ids.map((id) => node(folder(id))), pinned: [], archived: [] } },
});
const convSnap: Response<WorkspaceSnapshot> = { ok: true, data: { kind: 'conversation.list', conversations: [] } };
const qErr = (code: string): Response<WorkspaceSnapshot> => ({ ok: false, error: { code, message: code } });

// Route a query to the right canned response by selector kind. `treeIds` controls
// what the tree read returns (or an error when null). The conversation list is the
// unified read now (no platform arg); folder.counts is retired.
function wireQueries(treeIds: string[] | null, treeError = 'no_response') {
  mockQuery.mockImplementation((sel: WorkspaceSelector) => {
    if (sel.kind === 'conversation.list') return Promise.resolve(convSnap);
    if (sel.kind === 'conversation.active') {
      return Promise.resolve({ ok: true, data: { kind: 'conversation.active', active: null } } as Response<WorkspaceSnapshot>);
    }
    return Promise.resolve(treeIds ? treeSnap(treeIds) : qErr(treeError));
  });
}

// --- probe harness ----------------------------------------------------------
let latest: WorkspaceView | null = null;
function Probe({ platform = 'claude' as const }: { platform?: PlatformId }) {
  const ws = useWorkspace(platform);
  latest = ws;
  return <div data-testid="probe" data-status={ws.status} data-active={String(ws.tree.active.length)} />;
}

let container: HTMLElement | null = null;
function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  render(<Probe />, container);
}
const read = (attr: string) => container!.querySelector('[data-testid=probe]')!.getAttribute(attr);
const flush = async () => {
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
};

beforeEach(() => {
  latest = null;
  mockQuery.mockReset();
  mockMutate.mockReset();
});
afterEach(() => {
  if (container) render(null, container);
  document.body.innerHTML = '';
  container = null;
});

describe('useWorkspace load status (7.1)', () => {
  it('loading → ready when the first tree read succeeds', async () => {
    wireQueries(['a']);
    mount();
    expect(read('data-status')).toBe('loading');
    await flush();
    expect(read('data-status')).toBe('ready');
    expect(read('data-active')).toBe('1');
  });

  it('loading → error when the first tree read fails after the retry budget', async () => {
    wireQueries(null);
    mount();
    await flush();
    expect(read('data-status')).toBe('error');
  });

  it('error → ready when retry() re-reads successfully', async () => {
    wireQueries(null);
    mount();
    await flush();
    expect(read('data-status')).toBe('error');

    wireQueries(['a', 'b']); // worker is back
    latest!.retry();
    await flush();
    expect(read('data-status')).toBe('ready');
    expect(read('data-active')).toBe('2');
  });

  it('a failed reconcile after we already had data keeps the last good tree (no error flash)', async () => {
    wireQueries(['a']);
    mount();
    await flush();
    expect(read('data-status')).toBe('ready');

    wireQueries(null); // a later reconcile fails
    latest!.refresh();
    await flush();
    expect(read('data-status')).toBe('ready'); // not flipped to error
    expect(read('data-active')).toBe('1'); // last good data retained
  });
});

describe('useWorkspace observe-don’t-replay mutate (7.2, 7.3)', () => {
  it('a lost-ack mutation whose re-read shows the change renders it, sent exactly once (7.2)', async () => {
    wireQueries([]); // initial: empty
    mount();
    await flush();

    // The mutate ack is lost, but the worker committed — the reconciling re-read
    // now returns the created folder.
    mockMutate.mockResolvedValueOnce(qErr('no_response') as Response<never>);
    wireQueries(['new']); // re-read sees the committed folder

    const result = await latest!.mutate({ op: 'folder.create', id: 'new', name: 'New' } as MutationOp);
    await flush();

    // The lost-ack error is carried through (tier-gate added `error` to the result).
    expect(result).toEqual({ ok: false, applied: true, error: { code: 'no_response', message: 'no_response' } });
    expect(mockMutate).toHaveBeenCalledTimes(1); // never replayed
    expect(read('data-active')).toBe('1'); // reconciled into view
  });

  it('a mutation that reconciles to no-change reports failure, not swallowed (7.3)', async () => {
    wireQueries([]); // initial empty
    mount();
    await flush();

    mockMutate.mockResolvedValueOnce(qErr('send_failed') as Response<never>);
    wireQueries([]); // re-read still shows nothing — the change did not take effect

    const result = await latest!.mutate({ op: 'folder.create', id: 'gone', name: 'Gone' } as MutationOp);
    await flush();

    expect(result).toEqual({ ok: false, applied: false, error: { code: 'send_failed', message: 'send_failed' } });
    expect(mockMutate).toHaveBeenCalledTimes(1);
  });
});

describe('useWorkspace reconcile on visibility/focus (7.6)', () => {
  it('a visibilitychange → visible triggers a reconcile read', async () => {
    wireQueries(['a']);
    mount();
    await flush();
    const before = mockQuery.mock.calls.length;

    document.dispatchEvent(new Event('visibilitychange'));
    await flush();

    expect(mockQuery.mock.calls.length).toBeGreaterThan(before);
  });

  it('a window focus triggers a reconcile read', async () => {
    wireQueries(['a']);
    mount();
    await flush();
    const before = mockQuery.mock.calls.length;

    window.dispatchEvent(new Event('focus'));
    await flush();

    expect(mockQuery.mock.calls.length).toBeGreaterThan(before);
  });
});

describe('useWorkspace re-scopes the active card on a platform switch', () => {
  // A deferred promise holds the previous platform's active read "in flight" across
  // the platform change, reproducing the stale-closure race the coalesced loop must
  // not fall into: the swallowed-then-trailing re-run must read the NEW platform.
  function deferred(): { promise: Promise<void>; resolve: () => void } {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => (resolve = r));
    return { promise, resolve };
  }

  const activeResp = (platform: PlatformId): Response<WorkspaceSnapshot> => ({
    ok: true,
    data: {
      kind: 'conversation.active',
      active: { platform, nativeId: `${platform}-1`, title: platform, updatedAt: 0 },
    },
  });

  it('a trailing re-run after a platform switch reads the NEW platform, not the old', async () => {
    const gate = deferred();
    let geminiActiveCalls = 0;
    mockQuery.mockImplementation((sel: WorkspaceSelector) => {
      if (sel.kind === 'folder.tree') return Promise.resolve(treeSnap(['a']));
      if (sel.kind === 'conversation.list') return Promise.resolve(convSnap);
      // conversation.active, keyed by the requested platform.
      if (sel.platform === 'gemini') {
        geminiActiveCalls += 1;
        // Park only the FIRST gemini active read (the one running when the user
        // switches tabs); any later call resolves immediately.
        return geminiActiveCalls === 1
          ? gate.promise.then(() => activeResp('gemini'))
          : Promise.resolve(activeResp('gemini'));
      }
      return Promise.resolve(activeResp('perplexity'));
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    render(<Probe platform="gemini" />, container);
    await flush(); // gemini read starts; its active read is parked on `gate`

    // The active tab switches platforms before the gemini read resolves.
    render(<Probe platform="perplexity" />, container);
    await flush();

    // Release the parked gemini read: its trailing re-run must reconcile to the
    // CURRENT platform (perplexity), never clobber the view back to gemini's card.
    gate.resolve();
    await flush();

    expect(latest!.active?.platform).toBe('perplexity');
  });

  it('a prior platform’s late-resolving read never overwrites the switched-to card', async () => {
    // Park BOTH platforms' active reads so we can observe the window between the old
    // read resolving and the new read landing — the moment a stale write would flash.
    const geminiGate = deferred();
    const perplexityGate = deferred();
    let geminiCalls = 0;
    let perplexityCalls = 0;
    mockQuery.mockImplementation((sel: WorkspaceSelector) => {
      if (sel.kind === 'folder.tree') return Promise.resolve(treeSnap(['a']));
      if (sel.kind === 'conversation.list') return Promise.resolve(convSnap);
      if (sel.platform === 'gemini') {
        geminiCalls += 1;
        return geminiCalls === 1 ? geminiGate.promise.then(() => activeResp('gemini')) : Promise.resolve(activeResp('gemini'));
      }
      perplexityCalls += 1;
      return perplexityCalls === 1 ? perplexityGate.promise.then(() => activeResp('perplexity')) : Promise.resolve(activeResp('perplexity'));
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    render(<Probe platform="gemini" />, container);
    await flush(); // gemini active read parked

    render(<Probe platform="perplexity" />, container);
    await flush(); // setActive(null); the new read is swallowed (gemini still in flight)

    // The gemini read resolves first. Its trailing re-run then dispatches the
    // perplexity read, which is still parked — so the view must show NO active card
    // (the cleared null), never gemini's stale card.
    geminiGate.resolve();
    await flush();
    expect(latest!.active).toBeNull();

    // The perplexity read finally lands → the correct card appears.
    perplexityGate.resolve();
    await flush();
    expect(latest!.active?.platform).toBe('perplexity');
  });
});

describe('useWorkspace reconcile on tab switch (side panel)', () => {
  // The always-open side panel gets no focus/visibility event when the user switches
  // the active browser tab — so it must re-read on chrome.tabs activation/update.
  type Emit = () => void;
  function stubTabs() {
    let onActivated: Emit | null = null;
    let onUpdated: Emit | null = null;
    (globalThis as { chrome?: unknown }).chrome = {
      tabs: {
        onActivated: { addListener: (cb: Emit) => (onActivated = cb), removeListener: () => (onActivated = null) },
        onUpdated: { addListener: (cb: Emit) => (onUpdated = cb), removeListener: () => (onUpdated = null) },
      },
    };
    return { fireActivated: () => onActivated?.(), fireUpdated: () => onUpdated?.() };
  }

  afterEach(() => {
    delete (globalThis as { chrome?: unknown }).chrome;
  });

  it('tabs.onActivated triggers a reconcile read', async () => {
    const { fireActivated } = stubTabs();
    wireQueries(['a']);
    mount();
    await flush();
    const before = mockQuery.mock.calls.length;

    fireActivated();
    await flush();

    expect(mockQuery.mock.calls.length).toBeGreaterThan(before);
  });

  it('tabs.onUpdated triggers a reconcile read', async () => {
    const { fireUpdated } = stubTabs();
    wireQueries(['a']);
    mount();
    await flush();
    const before = mockQuery.mock.calls.length;

    fireUpdated();
    await flush();

    expect(mockQuery.mock.calls.length).toBeGreaterThan(before);
  });
});
