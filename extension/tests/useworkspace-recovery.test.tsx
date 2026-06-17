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
import type { Folder, FolderTreeNode } from '../src/shared/types';

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
const countsSnap: Response<WorkspaceSnapshot> = { ok: true, data: { kind: 'folder.counts', counts: {} } };
const convSnap: Response<WorkspaceSnapshot> = { ok: true, data: { kind: 'conversation.list', conversations: [] } };
const qErr = (code: string): Response<WorkspaceSnapshot> => ({ ok: false, error: { code, message: code } });

// Route a query to the right canned response by selector kind. `treeIds` controls
// what the tree read returns (or an error when null).
function wireQueries(treeIds: string[] | null, treeError = 'no_response') {
  mockQuery.mockImplementation((sel: WorkspaceSelector) => {
    if (sel.kind === 'folder.counts') return Promise.resolve(countsSnap);
    if (sel.kind === 'conversation.list') return Promise.resolve(convSnap);
    return Promise.resolve(treeIds ? treeSnap(treeIds) : qErr(treeError));
  });
}

// --- probe harness ----------------------------------------------------------
let latest: WorkspaceView | null = null;
function Probe({ platform = 'claude' as const }) {
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

    expect(result).toEqual({ ok: false, applied: true });
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

    expect(result).toEqual({ ok: false, applied: false });
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
