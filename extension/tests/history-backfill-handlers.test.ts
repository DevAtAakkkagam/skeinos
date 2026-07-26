// chatgpt-history-backfill worker-side coverage: the durable once-per-install gate
// on `PlatformState`, and backfill-aware recency stamping on `conversation.ingest`.
// Maps to the platform-adapter requirement "A backfill sweep runs once per install
// per platform" and the conversation-index requirement "Backfilled conversations are
// stamped below the existing recency floor".

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeWorkspaceStore, openDb, type WorkspaceStore } from '../src/core/store';
import { mutateWorkspace, queryWorkspace } from '../src/core/folders';
import type { ConversationIndex, PlatformState } from '../src/shared/types';

let dbCounter = 0;
let dbName = '';

async function freshStore(): Promise<WorkspaceStore> {
  dbName = `skeinos-backfill-${dbCounter++}`;
  return makeWorkspaceStore(await openDb(dbName));
}

/** Re-open the SAME database through a new facade — what an MV3 worker does after
 *  Chrome kills it on idle and a later event wakes it up (SW-2). */
async function reopenStore(): Promise<WorkspaceStore> {
  return makeWorkspaceStore(await openDb(dbName));
}

async function platformState(store: WorkspaceStore, platform: 'chatgpt'): Promise<PlatformState | null> {
  const snap = await queryWorkspace(store, { kind: 'platform.state', platform });
  if (snap.kind !== 'platform.state') throw new Error('expected platform.state');
  return snap.state;
}

async function conversations(store: WorkspaceStore): Promise<ConversationIndex[]> {
  const snap = await queryWorkspace(store, { kind: 'conversation.list' });
  if (snap.kind !== 'conversation.list') throw new Error('expected conversation.list');
  return snap.conversations;
}

/** `nativeId`s in the order the side panel renders them (newest first). */
async function byRecency(store: WorkspaceStore): Promise<string[]> {
  return (await conversations(store))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((c) => c.nativeId);
}

describe('durable once-per-install backfill state', () => {
  let store: WorkspaceStore;
  beforeEach(async () => {
    store = await freshStore();
  });

  it('reads as "never swept" before the sweep has run', async () => {
    expect(await platformState(store, 'chatgpt')).toBeNull();
  });

  it('records the outcome and round-trips it through a re-query', async () => {
    const res = await mutateWorkspace(store, {
      op: 'platform.recordHistoryBackfill',
      platform: 'chatgpt',
      stoppedBy: 'plateau',
    });
    expect(res.stores).toEqual(['platformState']);

    const state = await platformState(store, 'chatgpt');
    expect(state?.historyBackfillOutcome).toBe('plateau');
    expect(typeof state?.historyBackfilledAt).toBe('number');
  });

  it('stays readable after a simulated worker restart', async () => {
    await mutateWorkspace(store, {
      op: 'platform.recordHistoryBackfill',
      platform: 'chatgpt',
      stoppedBy: 'cap',
    });

    // Chrome killed the worker; a later event wakes it and it rehydrates from disk.
    const woken = await reopenStore();
    const state = await platformState(woken, 'chatgpt');
    expect(state?.historyBackfilledAt).toBeDefined();
    // A capped sweep is recorded as an INCOMPLETE backfill, distinguishable from a
    // plateau, so a later change can resume rather than re-sweep from scratch.
    expect(state?.historyBackfillOutcome).toBe('cap');
  });

  it('survives a later collapsed-list report on the same record', async () => {
    await mutateWorkspace(store, {
      op: 'platform.recordHistoryBackfill',
      platform: 'chatgpt',
      stoppedBy: 'plateau',
    });
    // The collapsed-list signal shares this record; rebuilding it wholesale here
    // would silently un-record the sweep and re-run it on the next page load.
    await mutateWorkspace(store, {
      op: 'platform.reportListState',
      platform: 'chatgpt',
      listCollapsed: true,
    });

    const state = await platformState(store, 'chatgpt');
    expect(state?.listCollapsed).toBe(true);
    expect(state?.historyBackfilledAt).toBeDefined();
  });
});

describe('backfill-aware recency stamping', () => {
  let store: WorkspaceStore;
  beforeEach(async () => {
    store = await freshStore();
  });

  /** The host list after a sweep: the rows the user already had, then the backlog. */
  const swept = [
    { nativeId: 'known-1', title: 'Yesterday' },
    { nativeId: 'known-2', title: 'Last week' },
    { nativeId: 'old-1', title: 'Last year' },
    { nativeId: 'old-2', title: 'Two years ago' },
    { nativeId: 'old-3', title: 'The very first chat' },
  ];

  it('sorts newly-discovered conversations below every pre-existing one', async () => {
    // A previous session indexed only the page ChatGPT had rendered.
    await mutateWorkspace(store, {
      op: 'conversation.ingest',
      platform: 'chatgpt',
      refs: swept.slice(0, 2),
    });
    const before = new Map((await conversations(store)).map((c) => [c.nativeId, c.updatedAt]));

    await mutateWorkspace(store, {
      op: 'conversation.ingest',
      platform: 'chatgpt',
      refs: swept,
      backfill: true,
    });

    const after = await conversations(store);
    const floor = Math.min(...[...before.values()]);
    for (const rec of after) {
      if (before.has(rec.nativeId)) continue;
      expect(rec.updatedAt).toBeLessThan(floor);
    }
    // …and the records the user already had keep the stamps they had.
    for (const rec of after) {
      if (before.has(rec.nativeId)) expect(rec.updatedAt).toBe(before.get(rec.nativeId));
    }
    // The panel's order is the host's order — the backlog appended, not interleaved.
    expect(await byRecency(store)).toEqual(swept.map((r) => r.nativeId));
  });

  it('keeps the backlog in host-list order', async () => {
    await mutateWorkspace(store, {
      op: 'conversation.ingest',
      platform: 'chatgpt',
      refs: swept.slice(0, 2),
    });
    await mutateWorkspace(store, {
      op: 'conversation.ingest',
      platform: 'chatgpt',
      refs: swept,
      backfill: true,
    });

    const stamps = new Map((await conversations(store)).map((c) => [c.nativeId, c.updatedAt]));
    expect(stamps.get('old-1')!).toBeGreaterThan(stamps.get('old-2')!);
    expect(stamps.get('old-2')!).toBeGreaterThan(stamps.get('old-3')!);
  });

  it("never lets another platform's records set the floor", async () => {
    // A Claude record stamped far in the past must not drag ChatGPT's backlog with
    // it — the floor is per-platform.
    await mutateWorkspace(store, {
      op: 'conversation.ingest',
      platform: 'claude',
      refs: [{ nativeId: 'claude-1', title: 'Claude' }],
    });
    const claudeBefore = (await conversations(store)).find((c) => c.platform === 'claude')!;

    await mutateWorkspace(store, {
      op: 'conversation.ingest',
      platform: 'chatgpt',
      refs: swept,
      backfill: true,
    });

    const claudeAfter = (await conversations(store)).find((c) => c.platform === 'claude')!;
    expect(claudeAfter.updatedAt).toBe(claudeBefore.updatedAt);
  });

  it('stamps an empty index in plain host-list order', async () => {
    await mutateWorkspace(store, {
      op: 'conversation.ingest',
      platform: 'chatgpt',
      refs: swept,
      backfill: true,
    });

    expect(await byRecency(store)).toEqual(swept.map((r) => r.nativeId));
    // Nothing existed to sort below, so no inversion and no negative stamps.
    expect((await conversations(store)).every((c) => c.updatedAt > 0)).toBe(true);
  });

  it('leaves an ordinary (non-backfill) ingest stamping exactly as before', async () => {
    const startedAt = Date.now();
    await mutateWorkspace(store, {
      op: 'conversation.ingest',
      platform: 'chatgpt',
      refs: swept,
    });

    // Today's rule: `now - position`, newest-first order preserved, stamped at "now"
    // rather than below any floor.
    expect(await byRecency(store)).toEqual(swept.map((r) => r.nativeId));
    for (const rec of await conversations(store)) {
      expect(rec.updatedAt).toBeGreaterThanOrEqual(startedAt - swept.length);
    }
  });

  it('re-running a backfill ingest is a hash-gated no-op', async () => {
    await mutateWorkspace(store, {
      op: 'conversation.ingest',
      platform: 'chatgpt',
      refs: swept,
      backfill: true,
    });
    const first = new Map((await conversations(store)).map((c) => [c.nativeId, c.updatedAt]));

    await mutateWorkspace(store, {
      op: 'conversation.ingest',
      platform: 'chatgpt',
      refs: swept,
      backfill: true,
    });

    for (const rec of await conversations(store)) {
      expect(rec.updatedAt).toBe(first.get(rec.nativeId));
    }
  });
});
