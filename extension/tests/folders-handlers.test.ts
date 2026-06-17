// folders spec coverage — worker query/mutate handlers (Vitest + fake-indexeddb).
// Maps to "Folder state is single-writer and multi-tab consistent" and the
// mutation requirements in openspec/changes/folders/specs/folders/spec.md.

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeWorkspaceStore, openDb, type WorkspaceStore } from '../src/core/store';
import { dispatch } from '../src/core/messaging';
import { __clearHandlers } from '../src/core/messaging/registry';
import { __resetWorkspaceStore } from '../src/core/store/instance';
import {
  FolderError,
  mutateWorkspace,
  queryWorkspace,
  registerFolderHandlers,
} from '../src/core/folders';
import type { RequestOf } from '../src/shared/messages';
import type { WorkspaceSnapshot } from '../src/shared/workspace';

const mutate = (op: RequestOf<'workspace.mutate'>['op']): RequestOf<'workspace.mutate'> => ({
  kind: 'workspace.mutate',
  op,
});

let dbCounter = 0;
async function freshStore(): Promise<WorkspaceStore> {
  const db = await openDb(`skeinos-folders-${dbCounter++}`);
  return makeWorkspaceStore(db);
}

function tree(snap: WorkspaceSnapshot) {
  if (snap.kind !== 'folder.tree') throw new Error('expected folder.tree');
  return snap.tree;
}

describe('mutate → persist → re-query round-trips', () => {
  let store: WorkspaceStore;
  beforeEach(async () => {
    store = await freshStore();
  });

  it('creates a nested, ordered tree and reflects rename/pin/archive', async () => {
    await mutateWorkspace(store, { op: 'folder.create', id: 'a', name: 'A' });
    await mutateWorkspace(store, { op: 'folder.create', id: 'b', name: 'B', parentId: 'a' });

    let snap = await queryWorkspace(store, { kind: 'folder.tree' });
    expect(tree(snap).active).toHaveLength(1);
    expect(tree(snap).active[0].folder.id).toBe('a');
    expect(tree(snap).active[0].children[0].folder.id).toBe('b');

    await mutateWorkspace(store, { op: 'folder.rename', id: 'a', name: 'Alpha' });
    await mutateWorkspace(store, { op: 'folder.pin', id: 'a', pinned: true });
    await mutateWorkspace(store, { op: 'folder.archive', id: 'b', archived: true });

    snap = await queryWorkspace(store, { kind: 'folder.tree' });
    expect(tree(snap).active[0].folder.name).toBe('Alpha');
    expect(tree(snap).pinned.map((f) => f.id)).toEqual(['a']);
    expect(tree(snap).archived.map((f) => f.id)).toEqual(['b']);
    // archived child no longer hangs under the active tree
    expect(tree(snap).active[0].children).toHaveLength(0);
  });

  it('ingests conversations and assigns one (filing reflected in the unified list)', async () => {
    await mutateWorkspace(store, { op: 'folder.create', id: 'a', name: 'A' });
    await mutateWorkspace(store, {
      op: 'conversation.ingest',
      platform: 'claude',
      refs: [{ nativeId: 'c1', title: 'One' }, { nativeId: 'c2', title: 'Two' }],
    });
    await mutateWorkspace(store, {
      op: 'conversation.assign',
      conversationId: 'claude::c1',
      folderId: 'a',
    });

    // counts are derived client-side now (folder.counts retired) — the unified
    // conversation.list is the single source the panel derives them from.
    const snap = await queryWorkspace(store, { kind: 'conversation.list' });
    if (snap.kind !== 'conversation.list') throw new Error('expected conversation.list');
    expect(snap.conversations.find((c) => c.id === 'claude::c1')?.folderId).toBe('a');
    expect(snap.conversations.find((c) => c.id === 'claude::c2')?.folderId).toBeNull();
  });

  it('conversation.list returns the UNIFIED set across every platform (no platform filter)', async () => {
    await mutateWorkspace(store, { op: 'folder.create', id: 'a', name: 'A' });
    await mutateWorkspace(store, {
      op: 'conversation.ingest',
      platform: 'claude',
      refs: [{ nativeId: 'c1', title: 'Claude one' }],
    });
    await mutateWorkspace(store, {
      op: 'conversation.ingest',
      platform: 'gemini',
      refs: [{ nativeId: 'g1', title: 'Gemini one' }],
    });
    // File both — from two different platforms — into the same folder.
    await mutateWorkspace(store, { op: 'conversation.assign', conversationId: 'claude::c1', folderId: 'a' });
    await mutateWorkspace(store, { op: 'conversation.assign', conversationId: 'gemini::g1', folderId: 'a' });

    const snap = await queryWorkspace(store, { kind: 'conversation.list' });
    if (snap.kind !== 'conversation.list') throw new Error('expected conversation.list');
    // Both platforms' conversations come back from the one unified read.
    expect(snap.conversations.map((c) => c.id).sort()).toEqual(['claude::c1', 'gemini::g1']);
    expect(snap.conversations.every((c) => c.folderId === 'a')).toBe(true);
  });

  it('re-ingesting preserves pin / archive / colour state (1.3)', async () => {
    await mutateWorkspace(store, {
      op: 'conversation.ingest',
      platform: 'claude',
      refs: [{ nativeId: 'c1', title: 'One' }],
    });
    await mutateWorkspace(store, { op: 'conversation.pin', conversationId: 'claude::c1', pinned: true });
    await mutateWorkspace(store, { op: 'conversation.recolor', conversationId: 'claude::c1', color: '#5aa9e6' });

    // A later page load re-ingests the same conversation (host title changed).
    await mutateWorkspace(store, {
      op: 'conversation.ingest',
      platform: 'claude',
      refs: [{ nativeId: 'c1', title: 'One (renamed by host)' }],
    });

    const conv = await store.conversations.get('claude::c1');
    expect(conv).toMatchObject({ pinned: true, color: '#5aa9e6', title: 'One (renamed by host)' });
  });

  it('re-ingesting preserves an existing folder assignment', async () => {
    await mutateWorkspace(store, { op: 'folder.create', id: 'a', name: 'A' });
    await mutateWorkspace(store, {
      op: 'conversation.ingest',
      platform: 'claude',
      refs: [{ nativeId: 'c1', title: 'One' }],
    });
    await mutateWorkspace(store, {
      op: 'conversation.assign',
      conversationId: 'claude::c1',
      folderId: 'a',
    });
    // A later page load re-ingests the same conversation.
    await mutateWorkspace(store, {
      op: 'conversation.ingest',
      platform: 'claude',
      refs: [{ nativeId: 'c1', title: 'One (renamed by host)' }],
    });

    const snap = await queryWorkspace(store, { kind: 'conversation.list' });
    if (snap.kind !== 'conversation.list') throw new Error('expected conversation.list');
    expect(snap.conversations.find((c) => c.id === 'claude::c1')?.folderId).toBe('a'); // still filed
  });
});

describe('conversation pin / archive / colour ops (2.4)', () => {
  let store: WorkspaceStore;
  beforeEach(async () => {
    store = await freshStore();
    await mutateWorkspace(store, {
      op: 'conversation.ingest',
      platform: 'claude',
      refs: [{ nativeId: 'c1', title: 'One' }],
    });
  });
  const id = 'claude::c1';

  it('pins and unpins a conversation, broadcasting the conversations store', async () => {
    const before = await store.conversations.get(id);
    const r = await mutateWorkspace(store, { op: 'conversation.pin', conversationId: id, pinned: true });
    expect(r.stores).toEqual(['conversations']);
    const pinned = await store.conversations.get(id);
    expect(pinned!.pinned).toBe(true);
    // The helper bumps updatedAt (conversations are local-only and carry no sync
    // envelope, so the re-sort key is updatedAt, not `rev`).
    expect(pinned!.updatedAt).toBeGreaterThanOrEqual(before!.updatedAt);

    await mutateWorkspace(store, { op: 'conversation.pin', conversationId: id, pinned: false });
    expect((await store.conversations.get(id))!.pinned).toBe(false);
  });

  it('archives and unarchives a conversation, retaining the row + folder', async () => {
    await mutateWorkspace(store, { op: 'conversation.assign', conversationId: id, folderId: null });
    const r = await mutateWorkspace(store, { op: 'conversation.archive', conversationId: id, archived: true });
    expect(r.stores).toEqual(['conversations']);
    const archived = await store.conversations.get(id);
    expect(archived!.archived).toBe(true);
    expect(archived).toBeTruthy(); // retained, not deleted

    await mutateWorkspace(store, { op: 'conversation.archive', conversationId: id, archived: false });
    expect((await store.conversations.get(id))!.archived).toBe(false);
  });

  it('sets and clears a conversation colour', async () => {
    const r = await mutateWorkspace(store, { op: 'conversation.recolor', conversationId: id, color: '#5cb98b' });
    expect(r.stores).toEqual(['conversations']);
    expect((await store.conversations.get(id))!.color).toBe('#5cb98b');

    await mutateWorkspace(store, { op: 'conversation.recolor', conversationId: id, color: undefined });
    expect((await store.conversations.get(id))!.color).toBeUndefined();
  });

  it('rejects pin / archive / recolor on a missing conversation, writing nothing', async () => {
    for (const op of [
      { op: 'conversation.pin', conversationId: 'claude::nope', pinned: true } as const,
      { op: 'conversation.archive', conversationId: 'claude::nope', archived: true } as const,
      { op: 'conversation.recolor', conversationId: 'claude::nope', color: '#000' } as const,
    ]) {
      await expect(mutateWorkspace(store, op)).rejects.toMatchObject({ code: 'folder_not_found' });
    }
    expect(await store.conversations.get('claude::nope')).toBeUndefined();
  });
});

describe('a rejected move leaves the store unchanged', () => {
  it('rejects a cycle and persists nothing', async () => {
    const store = await freshStore();
    await mutateWorkspace(store, { op: 'folder.create', id: 'a', name: 'A' });
    await mutateWorkspace(store, { op: 'folder.create', id: 'b', name: 'B', parentId: 'a' });

    await expect(
      mutateWorkspace(store, { op: 'folder.move', id: 'a', parentId: 'b' }),
    ).rejects.toMatchObject({ code: 'folder_cycle' });

    // 'a' is still a root with 'b' nested under it — nothing moved.
    const snap = await queryWorkspace(store, { kind: 'folder.tree' });
    expect(tree(snap).active[0].folder.id).toBe('a');
    expect(tree(snap).active[0].children[0].folder.id).toBe('b');
  });

  it('surfaces a depth violation as a typed error envelope through dispatch', async () => {
    __clearHandlers();
    __resetWorkspaceStore();
    registerFolderHandlers();

    // Build a 5-deep chain through the dispatched handler path.
    for (let i = 0; i < 5; i++) {
      await dispatch(
        mutate({ op: 'folder.create', id: `d${i}`, name: `d${i}`, parentId: i === 0 ? null : `d${i - 1}` }),
      );
    }
    const res = await dispatch(mutate({ op: 'folder.create', id: 'too-deep', name: 'x', parentId: 'd4' }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('folder_depth_exceeded');
  });

  it('FolderError carries its code', () => {
    expect(new FolderError('folder_cycle', 'x').code).toBe('folder_cycle');
  });
});

describe('a successful mutation broadcasts state.changed', () => {
  const originalChrome = (globalThis as { chrome?: unknown }).chrome;
  afterEach(() => {
    (globalThis as { chrome?: unknown }).chrome = originalChrome;
    __clearHandlers();
  });

  it('fans a state.changed broadcast to open tabs', async () => {
    const delivered: unknown[] = [];
    (globalThis as { chrome?: unknown }).chrome = {
      tabs: {
        query: async () => [{ id: 1 }],
        sendMessage: async (_id: number, msg: unknown) => void delivered.push(msg),
      },
    };
    __resetWorkspaceStore();
    registerFolderHandlers();

    const res = await dispatch(mutate({ op: 'folder.create', id: 'bx', name: 'Broadcast' }));
    expect(res.ok).toBe(true);

    const broadcasts = delivered.map((m) => m as { type?: string; payload?: { kind?: string } });
    expect(broadcasts.some((m) => m.payload?.kind === 'state.changed')).toBe(true);
  });
});
