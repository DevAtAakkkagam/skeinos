// prompts spec coverage — worker query/mutate handlers (Vitest + fake-indexeddb).
// Maps to openspec/changes/prompt-library-worker/specs/prompts/spec.md: the unified
// library read, prompt CRUD with worker-derived variables, flat-category lifecycle
// with reassignment on delete, and single-writer broadcast semantics.

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeWorkspaceStore, openDb, type WorkspaceStore } from '../src/core/store';
import { dispatch } from '../src/core/messaging';
import { __clearHandlers } from '../src/core/messaging/registry';
import { __resetWorkspaceStore } from '../src/core/store/instance';
import {
  PromptError,
  mutatePromptLibrary,
  queryPromptLibrary,
  registerPromptHandlers,
} from '../src/core/prompts';
import type { RequestOf } from '../src/shared/messages';
import type { PromptMutationOp, PromptSnapshot } from '../src/shared/prompts';

const mutate = (op: RequestOf<'prompts.mutate'>['op']): RequestOf<'prompts.mutate'> => ({
  kind: 'prompts.mutate',
  op,
});

let dbCounter = 0;
async function freshStore(): Promise<WorkspaceStore> {
  const db = await openDb(`skeinos-prompts-${dbCounter++}`);
  return makeWorkspaceStore(db);
}

async function library(
  store: WorkspaceStore,
): Promise<Extract<PromptSnapshot, { kind: 'prompt.library' }>> {
  const snap = await queryPromptLibrary(store, { kind: 'prompt.library' });
  if (snap.kind !== 'prompt.library') throw new Error('expected prompt.library snapshot');
  return snap;
}

const createOp = (over: Partial<Extract<PromptMutationOp, { op: 'prompt.create' }>> = {}) =>
  ({
    op: 'prompt.create',
    id: 'p1',
    title: 'A prompt',
    body: 'Hello {{name}}',
    ...over,
  }) as Extract<PromptMutationOp, { op: 'prompt.create' }>;

describe('prompt.create derives variables from the body (4.1)', () => {
  let store: WorkspaceStore;
  beforeEach(async () => {
    store = await freshStore();
  });

  it('parses text + select variables, sets usageCount 0, persists the metadata', async () => {
    const r = await mutatePromptLibrary(
      store,
      createOp({
        body: 'Write about {{topic}} for {{audience = devs | execs}}',
        description: 'd',
        tags: ['x'],
        targetModels: ['claude'],
        slug: '/w',
        promptFolderId: null,
      }),
    );
    expect(r.stores).toEqual(['prompts']);

    const p = await store.prompts.get('p1');
    expect(p).toBeTruthy();
    expect(p!.variables).toEqual([
      { name: 'topic', type: 'text' },
      { name: 'audience', type: 'select', options: ['devs', 'execs'], default: 'devs' },
    ]);
    expect(p!.usageCount).toBe(0);
    expect(p!.lastUsedAt).toBeUndefined();
    expect(p).toMatchObject({
      title: 'A prompt',
      description: 'd',
      tags: ['x'],
      targetModels: ['claude'],
      slug: '/w',
      promptFolderId: null,
    });
  });

  it('defaults optional collections when omitted', async () => {
    await mutatePromptLibrary(store, createOp({ body: 'no vars here' }));
    const p = await store.prompts.get('p1');
    expect(p!.variables).toEqual([]);
    expect(p!.tags).toEqual([]);
    expect(p!.targetModels).toEqual([]);
    expect(p!.promptFolderId).toBeNull();
  });
});

describe('prompt.update is a partial patch (4.2)', () => {
  let store: WorkspaceStore;
  beforeEach(async () => {
    store = await freshStore();
    await mutatePromptLibrary(store, createOp({ body: 'Hi {{name}}', tags: ['a'] }));
    // Seed the dormant usage fields directly to prove they survive an update.
    const seeded = await store.prompts.get('p1');
    await store.prompts.put({ ...seeded!, usageCount: 7, lastUsedAt: 123 });
  });

  it('re-derives variables when the body changes, preserving other fields', async () => {
    await mutatePromptLibrary(store, { op: 'prompt.update', id: 'p1', body: 'Now {{topic}} and {{name}}' });
    const p = await store.prompts.get('p1');
    expect(p!.variables.map((v) => v.name)).toEqual(['topic', 'name']);
    expect(p!.title).toBe('A prompt'); // untouched
    expect(p!.usageCount).toBe(7);
    expect(p!.lastUsedAt).toBe(123);
  });

  it('leaves variables and usage intact on a metadata-only update', async () => {
    await mutatePromptLibrary(store, { op: 'prompt.update', id: 'p1', title: 'Renamed', tags: ['b'] });
    const p = await store.prompts.get('p1');
    expect(p!.title).toBe('Renamed');
    expect(p!.tags).toEqual(['b']);
    expect(p!.variables.map((v) => v.name)).toEqual(['name']); // unchanged
    expect(p!.usageCount).toBe(7);
    expect(p!.lastUsedAt).toBe(123);
  });

  it('throws notFound and writes nothing for a missing id', async () => {
    await expect(
      mutatePromptLibrary(store, { op: 'prompt.update', id: 'nope', title: 'x' }),
    ).rejects.toMatchObject({ code: 'prompt_not_found' });
    expect(await store.prompts.get('nope')).toBeUndefined();
  });
});

describe('prompt.delete tombstones (4.3)', () => {
  it('drops the prompt out of a prompt.library read', async () => {
    const store = await freshStore();
    await mutatePromptLibrary(store, createOp());
    expect((await library(store)).prompts).toHaveLength(1);

    const r = await mutatePromptLibrary(store, { op: 'prompt.delete', id: 'p1' });
    expect(r.stores).toEqual(['prompts']);
    expect((await library(store)).prompts).toHaveLength(0);
  });

  it('throws notFound for a missing id', async () => {
    const store = await freshStore();
    await expect(
      mutatePromptLibrary(store, { op: 'prompt.delete', id: 'nope' }),
    ).rejects.toMatchObject({ code: 'prompt_not_found' });
  });
});

describe('category lifecycle (4.4)', () => {
  let store: WorkspaceStore;
  beforeEach(async () => {
    store = await freshStore();
  });

  it('creates and renames a category, surfaced via prompt.library', async () => {
    await mutatePromptLibrary(store, { op: 'promptFolder.create', id: 'c1', name: 'Research', order: 0, parentId: null });
    let snap = await library(store);
    expect(snap.folders.map((f) => f.name)).toEqual(['Research']);

    await mutatePromptLibrary(store, { op: 'promptFolder.rename', id: 'c1', name: 'Deep Research' });
    snap = await library(store);
    expect(snap.folders[0]).toMatchObject({ id: 'c1', name: 'Deep Research' });
  });

  it('reassigns prompts to null and reports both stores when deleting a non-empty category', async () => {
    await mutatePromptLibrary(store, { op: 'promptFolder.create', id: 'c1', name: 'C', order: 0, parentId: null });
    await mutatePromptLibrary(store, createOp({ id: 'p1', promptFolderId: 'c1' }));
    await mutatePromptLibrary(store, createOp({ id: 'p2', promptFolderId: 'c1' }));

    const r = await mutatePromptLibrary(store, { op: 'promptFolder.delete', id: 'c1' });
    expect(r.stores).toEqual(['promptFolders', 'prompts']);

    const snap = await library(store);
    expect(snap.folders).toHaveLength(0);
    expect(snap.prompts.every((p) => p.promptFolderId === null)).toBe(true);
  });

  it('reports only promptFolders when deleting an empty category', async () => {
    await mutatePromptLibrary(store, { op: 'promptFolder.create', id: 'c1', name: 'C', order: 0, parentId: null });
    const r = await mutatePromptLibrary(store, { op: 'promptFolder.delete', id: 'c1' });
    expect(r.stores).toEqual(['promptFolders']);
  });

  it('throws notFound deleting or renaming a missing category', async () => {
    await expect(
      mutatePromptLibrary(store, { op: 'promptFolder.delete', id: 'nope' }),
    ).rejects.toMatchObject({ code: 'prompt_not_found' });
    await expect(
      mutatePromptLibrary(store, { op: 'promptFolder.rename', id: 'nope', name: 'x' }),
    ).rejects.toMatchObject({ code: 'prompt_not_found' });
  });
});

describe('prompt.library read (4.5)', () => {
  it('returns the unified prompts + categories with no count fields', async () => {
    const store = await freshStore();
    await mutatePromptLibrary(store, { op: 'promptFolder.create', id: 'c1', name: 'C', order: 0, parentId: null });
    await mutatePromptLibrary(store, createOp({ id: 'p1' }));

    const snap = await library(store);
    expect(snap.kind).toBe('prompt.library');
    expect(snap.prompts.map((p) => p.id)).toEqual(['p1']);
    expect(snap.folders.map((f) => f.id)).toEqual(['c1']);
    // No derived counts leak into the snapshot.
    expect(snap).not.toHaveProperty('counts');
    expect(snap.folders[0]).not.toHaveProperty('count');
  });

  it('returns empty arrays (not an error) for an empty store', async () => {
    const store = await freshStore();
    const snap = await library(store);
    expect(snap).toEqual({ kind: 'prompt.library', prompts: [], folders: [] });
  });
});

describe('broadcast semantics (4.6)', () => {
  const originalChrome = (globalThis as { chrome?: unknown }).chrome;
  afterEach(() => {
    (globalThis as { chrome?: unknown }).chrome = originalChrome;
    __clearHandlers();
  });

  function captureBroadcasts(): unknown[] {
    const delivered: unknown[] = [];
    (globalThis as { chrome?: unknown }).chrome = {
      tabs: {
        query: async () => [{ id: 1 }],
        sendMessage: async (_id: number, msg: unknown) => void delivered.push(msg),
      },
    };
    return delivered;
  }

  it('broadcasts state.changed with the touched stores on a write', async () => {
    const delivered = captureBroadcasts();
    __resetWorkspaceStore();
    registerPromptHandlers();

    const res = await dispatch(mutate(createOp({ id: 'bx' })));
    expect(res.ok).toBe(true);

    const changed = delivered
      .map((m) => m as { payload?: { kind?: string; stores?: string[] } })
      .find((m) => m.payload?.kind === 'state.changed');
    expect(changed?.payload?.stores).toEqual(['prompts']);
  });

  it('emits no broadcast when a mutation throws (no write)', async () => {
    const delivered = captureBroadcasts();
    __resetWorkspaceStore();
    registerPromptHandlers();

    const res = await dispatch(mutate({ op: 'prompt.delete', id: 'missing' }));
    expect(res.ok).toBe(false);
    const anyStateChanged = delivered
      .map((m) => m as { payload?: { kind?: string } })
      .some((m) => m.payload?.kind === 'state.changed');
    expect(anyStateChanged).toBe(false);
  });

  it('PromptError carries its code', () => {
    expect(new PromptError('prompt_not_found', 'x').code).toBe('prompt_not_found');
  });
});
