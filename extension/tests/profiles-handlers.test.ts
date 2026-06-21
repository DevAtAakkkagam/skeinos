// profiles spec coverage — worker query/mutate handlers (Vitest + fake-indexeddb).
// Maps to openspec/changes/profiles-library/specs/profiles/spec.md: the profile
// library read with all fields, profile CRUD (create stamps the envelope, update is a
// partial patch, delete tombstones), and single-writer broadcast semantics.

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeWorkspaceStore, openDb, type WorkspaceStore } from '../src/core/store';
import { dispatch } from '../src/core/messaging';
import { __clearHandlers } from '../src/core/messaging/registry';
import { __resetWorkspaceStore } from '../src/core/store/instance';
import {
  PROFILE_ERROR,
  ProfileError,
  mutateProfileLibrary,
  queryProfileLibrary,
  registerProfileHandlers,
} from '../src/core/profiles';
import type { RequestOf } from '../src/shared/messages';
import type { ProfileMutationOp } from '../src/shared/profiles';

const mutate = (op: RequestOf<'profiles.mutate'>['op']): RequestOf<'profiles.mutate'> => ({
  kind: 'profiles.mutate',
  op,
});

let dbCounter = 0;
async function freshStore(): Promise<WorkspaceStore> {
  const db = await openDb(`skeinos-profiles-${dbCounter++}`);
  return makeWorkspaceStore(db);
}

async function library(store: WorkspaceStore) {
  return queryProfileLibrary(store, { kind: 'profile.library' });
}

const createOp = (
  over: Partial<Extract<ProfileMutationOp, { op: 'profile.create' }>> = {},
): Extract<ProfileMutationOp, { op: 'profile.create' }> => ({
  op: 'profile.create',
  id: 'pf1',
  name: 'A profile',
  instructionText: 'Be terse.',
  ...over,
});

describe('profile.library read (5.1)', () => {
  it('returns empty profiles (not an error) for an empty store', async () => {
    const store = await freshStore();
    expect(await library(store)).toEqual({ kind: 'profile.library', profiles: [] });
  });

  it('returns all non-tombstoned profiles with all fields', async () => {
    const store = await freshStore();
    await mutateProfileLibrary(
      store,
      createOp({
        id: 'pf1',
        name: 'Staff engineer',
        description: 'My default voice',
        instructionText: 'Act as a senior staff engineer.',
        appliesTo: ['claude', 'gemini'],
        responseStyle: { verbosity: 'brief', format: 'plain' },
      }),
    );

    const snap = await library(store);
    expect(snap.kind).toBe('profile.library');
    expect(snap.profiles).toHaveLength(1);
    expect(snap.profiles[0]).toMatchObject({
      id: 'pf1',
      name: 'Staff engineer',
      description: 'My default voice',
      instructionText: 'Act as a senior staff engineer.',
      appliesTo: ['claude', 'gemini'],
      responseStyle: { verbosity: 'brief', format: 'plain' },
    });
  });
});

describe('profile.create stamps the envelope (5.1)', () => {
  let store: WorkspaceStore;
  beforeEach(async () => {
    store = await freshStore();
  });

  it('stores the profile, stamps the sync envelope, and reports the touched store', async () => {
    const r = await mutateProfileLibrary(store, createOp());
    expect(r.stores).toEqual(['profiles']);

    const p = await store.profiles.get('pf1');
    expect(p).toBeTruthy();
    expect(typeof p!.rev).toBe('number');
    expect(typeof p!.updatedAt).toBe('number');
    expect(typeof p!.deviceId).toBe('string');
    expect(typeof p!.hash).toBe('string');
  });

  it('defaults appliesTo to [] and only sets description/responseStyle when provided', async () => {
    await mutateProfileLibrary(store, createOp({ id: 'pf-min' }));
    const p = await store.profiles.get('pf-min');
    expect(p!.appliesTo).toEqual([]);
    expect(p!.description).toBeUndefined();
    expect(p!.responseStyle).toBeUndefined();
  });
});

describe('profile.update is a partial patch (5.1)', () => {
  let store: WorkspaceStore;
  beforeEach(async () => {
    store = await freshStore();
    await mutateProfileLibrary(
      store,
      createOp({
        id: 'pf1',
        name: 'Original',
        description: 'desc',
        instructionText: 'old text',
        appliesTo: ['claude'],
        responseStyle: { verbosity: 'balanced', format: 'markdown' },
      }),
    );
  });

  it('changes only instructionText and preserves the rest; re-stamps the envelope', async () => {
    const before = await store.profiles.get('pf1');
    const r = await mutateProfileLibrary(store, {
      op: 'profile.update',
      id: 'pf1',
      instructionText: 'new text',
    });
    expect(r.stores).toEqual(['profiles']);

    const p = await store.profiles.get('pf1');
    expect(p!.instructionText).toBe('new text');
    // The rest is preserved verbatim.
    expect(p!.name).toBe('Original');
    expect(p!.description).toBe('desc');
    expect(p!.appliesTo).toEqual(['claude']);
    expect(p!.responseStyle).toEqual({ verbosity: 'balanced', format: 'markdown' });
    // The envelope is re-stamped (rev bumped).
    expect(p!.rev).toBeGreaterThan(before!.rev);
  });

  it('changes only appliesTo and preserves the rest', async () => {
    await mutateProfileLibrary(store, {
      op: 'profile.update',
      id: 'pf1',
      appliesTo: ['gemini', 'perplexity'],
    });
    const p = await store.profiles.get('pf1');
    expect(p!.appliesTo).toEqual(['gemini', 'perplexity']);
    expect(p!.name).toBe('Original');
    expect(p!.instructionText).toBe('old text');
  });

  it('throws notFound and writes nothing for a missing id', async () => {
    await expect(
      mutateProfileLibrary(store, { op: 'profile.update', id: 'nope', name: 'x' }),
    ).rejects.toMatchObject({ code: PROFILE_ERROR.notFound });
    expect(await store.profiles.get('nope')).toBeUndefined();
  });
});

describe('profile.delete tombstones (5.1)', () => {
  it('drops the profile out of a subsequent profile.library read', async () => {
    const store = await freshStore();
    await mutateProfileLibrary(store, createOp());
    expect((await library(store)).profiles).toHaveLength(1);

    const r = await mutateProfileLibrary(store, { op: 'profile.delete', id: 'pf1' });
    expect(r.stores).toEqual(['profiles']);
    expect((await library(store)).profiles).toHaveLength(0);
  });

  it('throws notFound for a missing id', async () => {
    const store = await freshStore();
    await expect(
      mutateProfileLibrary(store, { op: 'profile.delete', id: 'nope' }),
    ).rejects.toMatchObject({ code: PROFILE_ERROR.notFound });
  });
});

describe('broadcast semantics (5.1)', () => {
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

  it('broadcasts state.changed with the touched stores on a successful create', async () => {
    const delivered = captureBroadcasts();
    __resetWorkspaceStore();
    registerProfileHandlers();

    const res = await dispatch(mutate(createOp({ id: 'bx' })));
    expect(res.ok).toBe(true);

    const changed = delivered
      .map((m) => m as { payload?: { kind?: string; stores?: string[] } })
      .find((m) => m.payload?.kind === 'state.changed');
    expect(changed?.payload?.stores).toEqual(['profiles']);
  });

  it('emits no broadcast when a mutation throws (delete missing id)', async () => {
    const delivered = captureBroadcasts();
    __resetWorkspaceStore();
    registerProfileHandlers();

    const res = await dispatch(mutate({ op: 'profile.delete', id: 'missing' }));
    expect(res.ok).toBe(false);
    const anyStateChanged = delivered
      .map((m) => m as { payload?: { kind?: string } })
      .some((m) => m.payload?.kind === 'state.changed');
    expect(anyStateChanged).toBe(false);
  });

  it('ProfileError carries its code', () => {
    expect(new ProfileError('profile_not_found', 'x').code).toBe('profile_not_found');
  });
});
