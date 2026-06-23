// tags spec coverage — worker query/mutate handlers (Vitest + fake-indexeddb).
// Maps to the requirements in openspec/changes/tags/specs/tags/spec.md: create
// (persist + broadcast, label required, tier-gated), rename/recolor, delete cleanup,
// and multi-tag assignment to conversations and prompts. Tags ride the shared
// workspace.query/mutate kinds, so these drive the same `mutateWorkspace` /
// `queryWorkspace` entry points the folders handler registers.

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeWorkspaceStore, openDb, type WorkspaceStore } from '../src/core/store';
import { dispatch } from '../src/core/messaging';
import { __clearHandlers } from '../src/core/messaging/registry';
import { __resetWorkspaceStore } from '../src/core/store/instance';
import { mutateWorkspace, queryWorkspace, registerFolderHandlers } from '../src/core/folders';
import { SETTINGS_KEY, type Settings } from '../src/shared/settings';
import type { RequestOf } from '../src/shared/messages';
import type { WorkspaceSnapshot } from '../src/shared/workspace';
import type { Tag } from '../src/shared/types';

let dbCounter = 0;
async function freshStore(): Promise<WorkspaceStore> {
  const db = await openDb(`skeinos-tags-${dbCounter++}`);
  return makeWorkspaceStore(db);
}

function tagsOf(snap: WorkspaceSnapshot): Tag[] {
  if (snap.kind !== 'tag.list') throw new Error('expected tag.list');
  return snap.tags;
}

const listTags = (store: WorkspaceStore) => queryWorkspace(store, { kind: 'tag.list' }).then(tagsOf);

// --- minimal chrome shim so getSettings() can resolve a tier from storage.local ---
function installChrome(seed: Partial<Settings> = {}): void {
  const store: Record<string, unknown> = { [SETTINGS_KEY]: seed };
  (globalThis as { chrome?: unknown }).chrome = {
    storage: {
      local: {
        async get(keys: string | string[] | null) {
          if (keys == null) return { ...store };
          const ks = Array.isArray(keys) ? keys : [keys];
          const out: Record<string, unknown> = {};
          for (const k of ks) if (k in store) out[k] = store[k];
          return out;
        },
        async set(items: Record<string, unknown>) {
          Object.assign(store, items);
        },
      },
      onChanged: { addListener: () => {}, removeListener: () => {} },
    },
  };
}

describe('tag create', () => {
  let store: WorkspaceStore;
  beforeEach(async () => {
    store = await freshStore();
    installChrome({ tier: 'PRO' });
  });
  afterEach(() => {
    delete (globalThis as { chrome?: unknown }).chrome;
  });

  it('persists a tag with a stamped sync envelope and reports the tags store (4.1)', async () => {
    const res = await mutateWorkspace(store, { op: 'tag.create', id: 't1', label: 'Research' });
    expect(res.stores).toEqual(['tags']);
    const tags = await listTags(store);
    expect(tags.map((t) => t.label)).toEqual(['Research']);
    // The sync envelope is stamped by the store's write path.
    const rec = await store.tags.get('t1');
    expect(rec).toMatchObject({ label: 'Research', rev: expect.any(Number), hash: expect.any(String) });
  });

  it('rejects an empty / whitespace-only label and writes nothing (4.1)', async () => {
    await expect(mutateWorkspace(store, { op: 'tag.create', id: 't1', label: '   ' })).rejects.toMatchObject({
      code: 'tag_label_empty',
    });
    expect(await listTags(store)).toHaveLength(0);
  });

  it('trims the label before persisting', async () => {
    await mutateWorkspace(store, { op: 'tag.create', id: 't1', label: '  Work  ' });
    expect((await store.tags.get('t1'))!.label).toBe('Work');
  });
});

describe('tag create tier gate (4.2)', () => {
  let store: WorkspaceStore;
  beforeEach(async () => {
    store = await freshStore();
  });
  afterEach(() => {
    delete (globalThis as { chrome?: unknown }).chrome;
  });

  it('blocks the 11th tag on FREE with quota_exceeded { resource: tags, count: 10, limit: 10 }', async () => {
    installChrome({ tier: 'FREE' });
    for (let i = 0; i < 10; i++) {
      await mutateWorkspace(store, { op: 'tag.create', id: `t${i}`, label: `Tag ${i}` });
    }
    await expect(
      mutateWorkspace(store, { op: 'tag.create', id: 't10', label: 'Overflow' }),
    ).rejects.toMatchObject({ code: 'quota_exceeded', detail: { resource: 'tags', count: 10, limit: 10 } });
    expect(await listTags(store)).toHaveLength(10);
  });

  it('PRO tier is unlimited', async () => {
    installChrome({ tier: 'PRO' });
    for (let i = 0; i < 12; i++) {
      await mutateWorkspace(store, { op: 'tag.create', id: `t${i}`, label: `Tag ${i}` });
    }
    expect(await listTags(store)).toHaveLength(12);
  });
});

describe('tag rename / recolor (4.3)', () => {
  let store: WorkspaceStore;
  beforeEach(async () => {
    store = await freshStore();
    installChrome({ tier: 'PRO' });
    await mutateWorkspace(store, { op: 'tag.create', id: 't1', label: 'Old' });
  });
  afterEach(() => {
    delete (globalThis as { chrome?: unknown }).chrome;
  });

  it('renames with a bumped rev', async () => {
    const before = await store.tags.get('t1');
    await mutateWorkspace(store, { op: 'tag.rename', id: 't1', label: 'New' });
    const after = await store.tags.get('t1');
    expect(after!.label).toBe('New');
    expect(after!.rev).toBeGreaterThan(before!.rev);
  });

  it('sets a colour, then clears it when omitted', async () => {
    await mutateWorkspace(store, { op: 'tag.recolor', id: 't1', color: '#5aa9e6' });
    expect((await store.tags.get('t1'))!.color).toBe('#5aa9e6');
    await mutateWorkspace(store, { op: 'tag.recolor', id: 't1', color: undefined });
    expect((await store.tags.get('t1'))!.color).toBeUndefined();
  });

  it('rejects rename/recolor on a missing tag', async () => {
    await expect(mutateWorkspace(store, { op: 'tag.rename', id: 'nope', label: 'X' })).rejects.toMatchObject({
      code: 'tag_not_found',
    });
  });
});

describe('tag delete detaches carriers (4.4)', () => {
  let store: WorkspaceStore;
  beforeEach(async () => {
    store = await freshStore();
    installChrome({ tier: 'PRO' });
  });
  afterEach(() => {
    delete (globalThis as { chrome?: unknown }).chrome;
  });

  it('tombstones the tag and removes its id from every carrier conversation and prompt', async () => {
    await mutateWorkspace(store, { op: 'tag.create', id: 't1', label: 'Shared' });
    await mutateWorkspace(store, {
      op: 'conversation.ingest',
      platform: 'claude',
      refs: [{ nativeId: 'c1', title: 'One' }, { nativeId: 'c2', title: 'Two' }],
    });
    await store.prompts.put({
      id: 'p1',
      title: 'P',
      body: 'b',
      variables: [],
      tags: [],
      targetModels: [],
      promptFolderId: null,
      usageCount: 0,
    } as never);
    // Attach the tag to two conversations and one prompt.
    await mutateWorkspace(store, { op: 'conversation.tag', id: 'claude::c1', tagId: 't1', assigned: true });
    await mutateWorkspace(store, { op: 'conversation.tag', id: 'claude::c2', tagId: 't1', assigned: true });
    await mutateWorkspace(store, { op: 'prompt.tag', id: 'p1', tagId: 't1', assigned: true });

    const res = await mutateWorkspace(store, { op: 'tag.delete', id: 't1' });
    expect(res.stores).toEqual(['tags', 'conversations', 'prompts']);

    // Tombstone: the tag no longer reads back.
    expect(await store.tags.get('t1')).toBeUndefined();
    // No carrier still references the id.
    expect((await store.conversations.get('claude::c1'))!.tags).not.toContain('t1');
    expect((await store.conversations.get('claude::c2'))!.tags).not.toContain('t1');
    expect((await store.prompts.get('p1'))!.tags).not.toContain('t1');
  });

  it('reports only the tags store when the deleted tag had no carriers', async () => {
    await mutateWorkspace(store, { op: 'tag.create', id: 't1', label: 'Lonely' });
    const res = await mutateWorkspace(store, { op: 'tag.delete', id: 't1' });
    expect(res.stores).toEqual(['tags']);
  });
});

describe('tag assignment (4.5)', () => {
  let store: WorkspaceStore;
  const id = 'claude::c1';
  beforeEach(async () => {
    store = await freshStore();
    installChrome({ tier: 'PRO' });
    await mutateWorkspace(store, { op: 'tag.create', id: 't1', label: 'A' });
    await mutateWorkspace(store, { op: 'tag.create', id: 't2', label: 'B' });
    await mutateWorkspace(store, {
      op: 'conversation.ingest',
      platform: 'claude',
      refs: [{ nativeId: 'c1', title: 'One' }],
    });
  });
  afterEach(() => {
    delete (globalThis as { chrome?: unknown }).chrome;
  });

  it('carries multiple tags on one conversation', async () => {
    await mutateWorkspace(store, { op: 'conversation.tag', id, tagId: 't1', assigned: true });
    await mutateWorkspace(store, { op: 'conversation.tag', id, tagId: 't2', assigned: true });
    expect((await store.conversations.get(id))!.tags.sort()).toEqual(['t1', 't2']);
  });

  it('is idempotent (re-assigning adds no duplicate, reports no store)', async () => {
    await mutateWorkspace(store, { op: 'conversation.tag', id, tagId: 't1', assigned: true });
    const res = await mutateWorkspace(store, { op: 'conversation.tag', id, tagId: 't1', assigned: true });
    expect(res.stores).toEqual([]);
    expect((await store.conversations.get(id))!.tags).toEqual(['t1']);
  });

  it('unassign removes the tag; removing an absent tag is a no-op', async () => {
    await mutateWorkspace(store, { op: 'conversation.tag', id, tagId: 't1', assigned: true });
    await mutateWorkspace(store, { op: 'conversation.tag', id, tagId: 't1', assigned: false });
    expect((await store.conversations.get(id))!.tags).toEqual([]);
    const res = await mutateWorkspace(store, { op: 'conversation.tag', id, tagId: 't1', assigned: false });
    expect(res.stores).toEqual([]);
  });

  it('rejects an unknown tag id', async () => {
    await expect(
      mutateWorkspace(store, { op: 'conversation.tag', id, tagId: 'ghost', assigned: true }),
    ).rejects.toMatchObject({ code: 'tag_not_found' });
  });

  it('rejects assignment on a missing conversation', async () => {
    await expect(
      mutateWorkspace(store, { op: 'conversation.tag', id: 'claude::nope', tagId: 't1', assigned: true }),
    ).rejects.toMatchObject({ code: 'tag_not_found' });
  });
});

describe('a tag mutation broadcasts state.changed', () => {
  const originalChrome = (globalThis as { chrome?: unknown }).chrome;
  afterEach(() => {
    (globalThis as { chrome?: unknown }).chrome = originalChrome;
    __clearHandlers();
  });

  it('fans a state.changed broadcast after a tag create (4.1)', async () => {
    const delivered: unknown[] = [];
    const store: Record<string, unknown> = { [SETTINGS_KEY]: { tier: 'PRO' } };
    (globalThis as { chrome?: unknown }).chrome = {
      tabs: {
        query: async () => [{ id: 1 }],
        sendMessage: async (_id: number, msg: unknown) => void delivered.push(msg),
      },
      storage: {
        local: {
          async get() {
            return { ...store };
          },
          async set() {},
        },
        onChanged: { addListener: () => {}, removeListener: () => {} },
      },
    };
    __resetWorkspaceStore();
    registerFolderHandlers();

    const mutate = (op: RequestOf<'workspace.mutate'>['op']): RequestOf<'workspace.mutate'> => ({
      kind: 'workspace.mutate',
      op,
    });
    const res = await dispatch(mutate({ op: 'tag.create', id: 'bx', label: 'Broadcast' }));
    expect(res.ok).toBe(true);
    const broadcasts = delivered.map((m) => m as { payload?: { kind?: string } });
    expect(broadcasts.some((m) => m.payload?.kind === 'state.changed')).toBe(true);
  });
});
