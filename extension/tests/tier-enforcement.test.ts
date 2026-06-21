// tier-gate spec coverage — worker-side quota enforcement on the three create
// handlers (folders / prompts / profiles). Maps to
// openspec/changes/tier-gate/specs/tier-gate/spec.md: a create at the FREE limit
// is rejected with `quota_exceeded` (resource/count/limit) and writes nothing;
// below the limit it succeeds; a delete frees quota; PRO bypasses entirely.
//
// Tier is read by the handlers via `getSettings()` → `chrome.storage.local`, so a
// minimal fake `chrome` seeds the tier per describe (the worker's D3 read path).

import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { makeWorkspaceStore, openDb, type WorkspaceStore } from '../src/core/store';
import { mutateWorkspace, registerFolderHandlers } from '../src/core/folders';
import { mutatePromptLibrary } from '../src/core/prompts';
import { mutateProfileLibrary } from '../src/core/profiles';
import { dispatch } from '../src/core/messaging';
import { __clearHandlers } from '../src/core/messaging/registry';
import { __resetWorkspaceStore } from '../src/core/store/instance';
import { QUOTA_EXCEEDED, TIER_LIMITS, type Tier } from '../src/core/tier';
import { SETTINGS_KEY } from '../src/shared/settings';
import type { RequestOf } from '../src/shared/messages';

const wsMutate = (op: RequestOf<'workspace.mutate'>['op']): RequestOf<'workspace.mutate'> => ({
  kind: 'workspace.mutate',
  op,
});

// --- a minimal fake `chrome.storage.local` seeded with a tier ----------------

const originalChrome = (globalThis as { chrome?: unknown }).chrome;
afterEach(() => {
  (globalThis as { chrome?: unknown }).chrome = originalChrome;
});

function setTier(tier: Tier): void {
  const store: Record<string, unknown> = { [SETTINGS_KEY]: { tier } };
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
      onChanged: { addListener() {}, removeListener() {} },
    },
  };
}

let dbCounter = 0;
async function freshStore(): Promise<WorkspaceStore> {
  const db = await openDb(`skeinos-tier-${dbCounter++}`);
  return makeWorkspaceStore(db);
}

// --- folders -----------------------------------------------------------------

describe('folders quota (2.1)', () => {
  const limit = TIER_LIMITS.FREE.folders; // 5

  async function fill(store: WorkspaceStore, n: number): Promise<void> {
    for (let i = 0; i < n; i++) {
      await mutateWorkspace(store, { op: 'folder.create', id: `f${i}`, name: `F${i}` });
    }
  }

  it('rejects the create at the limit with quota_exceeded + detail, writing nothing', async () => {
    setTier('FREE');
    const store = await freshStore();
    await fill(store, limit);

    let thrown: unknown;
    try {
      await mutateWorkspace(store, { op: 'folder.create', id: 'over', name: 'Over' });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as { code?: string }).code).toBe(QUOTA_EXCEEDED);
    expect((thrown as { detail?: unknown }).detail).toEqual({
      resource: 'folders',
      count: limit,
      limit,
    });
    expect(await store.folders.get('over')).toBeUndefined();
    expect(await store.folders.query()).toHaveLength(limit);
  });

  it('allows the create just below the limit', async () => {
    setTier('FREE');
    const store = await freshStore();
    await fill(store, limit - 1);
    await expect(
      mutateWorkspace(store, { op: 'folder.create', id: 'last', name: 'Last' }),
    ).resolves.toEqual({ stores: ['folders'] });
  });

  it('deleting frees quota for a subsequent create', async () => {
    setTier('FREE');
    const store = await freshStore();
    await fill(store, limit);
    await mutateWorkspace(store, { op: 'folder.delete', id: 'f0' });
    await expect(
      mutateWorkspace(store, { op: 'folder.create', id: 'after', name: 'After' }),
    ).resolves.toMatchObject({ stores: expect.arrayContaining(['folders']) });
  });

  it('PRO bypasses the limit entirely', async () => {
    setTier('PRO');
    const store = await freshStore();
    await fill(store, limit + 3);
    expect(await store.folders.query()).toHaveLength(limit + 3);
  });
});

// --- prompts -----------------------------------------------------------------

describe('prompts quota (2.2)', () => {
  const limit = TIER_LIMITS.FREE.prompts; // 25

  async function fill(store: WorkspaceStore, n: number): Promise<void> {
    for (let i = 0; i < n; i++) {
      await mutatePromptLibrary(store, {
        op: 'prompt.create',
        id: `p${i}`,
        title: `P${i}`,
        body: 'body',
      });
    }
  }

  it('rejects at the limit with quota_exceeded naming prompts, writing nothing', async () => {
    setTier('FREE');
    const store = await freshStore();
    await fill(store, limit);

    let thrown: unknown;
    try {
      await mutatePromptLibrary(store, { op: 'prompt.create', id: 'over', title: 'Over', body: 'b' });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as { code?: string }).code).toBe(QUOTA_EXCEEDED);
    expect((thrown as { detail?: unknown }).detail).toEqual({
      resource: 'prompts',
      count: limit,
      limit,
    });
    expect(await store.prompts.get('over')).toBeUndefined();
  });

  it('allows the create just below the limit', async () => {
    setTier('FREE');
    const store = await freshStore();
    await fill(store, limit - 1);
    await expect(
      mutatePromptLibrary(store, { op: 'prompt.create', id: 'last', title: 'Last', body: 'b' }),
    ).resolves.toEqual({ stores: ['prompts'] });
  });

  it('deleting frees quota for a subsequent create', async () => {
    setTier('FREE');
    const store = await freshStore();
    await fill(store, limit);
    await mutatePromptLibrary(store, { op: 'prompt.delete', id: 'p0' });
    await expect(
      mutatePromptLibrary(store, { op: 'prompt.create', id: 'after', title: 'After', body: 'b' }),
    ).resolves.toEqual({ stores: ['prompts'] });
  });

  it('PRO bypasses the limit entirely', async () => {
    setTier('PRO');
    const store = await freshStore();
    await fill(store, limit + 2);
    expect(await store.prompts.query()).toHaveLength(limit + 2);
  });
});

// --- profiles ----------------------------------------------------------------

describe('profiles quota (2.3)', () => {
  const limit = TIER_LIMITS.FREE.profiles; // 3

  async function fill(store: WorkspaceStore, n: number): Promise<void> {
    for (let i = 0; i < n; i++) {
      await mutateProfileLibrary(store, {
        op: 'profile.create',
        id: `pf${i}`,
        name: `PF${i}`,
        instructionText: 'be terse',
      });
    }
  }

  it('rejects at the limit with quota_exceeded naming profiles, writing nothing', async () => {
    setTier('FREE');
    const store = await freshStore();
    await fill(store, limit);

    let thrown: unknown;
    try {
      await mutateProfileLibrary(store, {
        op: 'profile.create',
        id: 'over',
        name: 'Over',
        instructionText: 'x',
      });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as { code?: string }).code).toBe(QUOTA_EXCEEDED);
    expect((thrown as { detail?: unknown }).detail).toEqual({
      resource: 'profiles',
      count: limit,
      limit,
    });
    expect(await store.profiles.get('over')).toBeUndefined();
  });

  it('allows the create just below the limit', async () => {
    setTier('FREE');
    const store = await freshStore();
    await fill(store, limit - 1);
    await expect(
      mutateProfileLibrary(store, {
        op: 'profile.create',
        id: 'last',
        name: 'Last',
        instructionText: 'x',
      }),
    ).resolves.toEqual({ stores: ['profiles'] });
  });

  it('deleting frees quota for a subsequent create', async () => {
    setTier('FREE');
    const store = await freshStore();
    await fill(store, limit);
    await mutateProfileLibrary(store, { op: 'profile.delete', id: 'pf0' });
    await expect(
      mutateProfileLibrary(store, {
        op: 'profile.create',
        id: 'after',
        name: 'After',
        instructionText: 'x',
      }),
    ).resolves.toEqual({ stores: ['profiles'] });
  });

  it('PRO bypasses the limit entirely', async () => {
    setTier('PRO');
    const store = await freshStore();
    await fill(store, limit + 4);
    expect(await store.profiles.query()).toHaveLength(limit + 4);
  });
});

// --- no broadcast on a quota-refused create (2.4) ----------------------------

describe('a quota-refused create emits no state.changed broadcast (2.4)', () => {
  it('the dispatched folder.create at the limit returns quota_exceeded and broadcasts nothing', async () => {
    // chrome with BOTH a FREE-tier settings read and a tabs sink to capture broadcasts.
    const delivered: unknown[] = [];
    const seed: Record<string, unknown> = { [SETTINGS_KEY]: { tier: 'FREE' } };
    (globalThis as { chrome?: unknown }).chrome = {
      tabs: {
        query: async () => [{ id: 1 }],
        sendMessage: async (_id: number, msg: unknown) => void delivered.push(msg),
      },
      storage: {
        local: {
          async get(keys: string | string[] | null) {
            if (keys == null) return { ...seed };
            const ks = Array.isArray(keys) ? keys : [keys];
            const out: Record<string, unknown> = {};
            for (const k of ks) if (k in seed) out[k] = seed[k];
            return out;
          },
          async set() {},
        },
        onChanged: { addListener() {}, removeListener() {} },
      },
    };
    __clearHandlers();
    __resetWorkspaceStore();
    registerFolderHandlers();

    // Fill to the FREE limit through the dispatched handler path.
    for (let i = 0; i < TIER_LIMITS.FREE.folders; i++) {
      await dispatch(wsMutate({ op: 'folder.create', id: `g${i}`, name: `G${i}` }));
    }
    delivered.length = 0; // ignore the successful-create broadcasts

    const res = await dispatch(wsMutate({ op: 'folder.create', id: 'over', name: 'Over' }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe(QUOTA_EXCEEDED);

    const anyStateChanged = delivered
      .map((m) => m as { payload?: { kind?: string } })
      .some((m) => m.payload?.kind === 'state.changed');
    expect(anyStateChanged).toBe(false);
  });
});
