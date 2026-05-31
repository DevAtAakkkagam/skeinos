// workspace-store spec coverage (Vitest + fake-indexeddb). Each `describe`
// maps to one spec requirement in openspec/changes/workspace-store.

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteDB, type IDBPDatabase } from 'idb';
import {
  makeWorkspaceStore,
  openDb,
  syncableStores,
  type Migration,
  type WorkspaceStore,
} from '../src/core/store';
import { ALL_STORES } from '../src/core/store/schema';
import type { Folder } from '../src/shared/types';

let dbCounter = 0;

async function freshStore(): Promise<WorkspaceStore> {
  const name = `skeinos-test-${dbCounter++}`;
  const db = await openDb(name);
  return makeWorkspaceStore(db);
}

function folder(id: string, over: Partial<Folder> = {}): Folder {
  return {
    id,
    name: `Folder ${id}`,
    parentId: null,
    platformScope: 'unified',
    order: 0,
    // envelope fields are overwritten on put; provide placeholders
    rev: 0,
    updatedAt: 0,
    deviceId: '',
    hash: '',
    ...over,
  };
}

describe('Typed repository CRUD (4.1)', () => {
  let store: WorkspaceStore;
  beforeEach(async () => {
    store = await freshStore();
  });

  it('put then get round-trips a record including envelope fields', async () => {
    await store.folders.put(folder('a', { name: 'Alpha' }));
    const got = await store.folders.get('a');
    expect(got).toBeDefined();
    expect(got!.name).toBe('Alpha');
    expect(got!.rev).toBe(1);
    expect(got!.deviceId).toBeTruthy();
    expect(got!.hash).toBeTruthy();
  });

  it('query by index returns only records in the key range', async () => {
    await store.folders.put(folder('a', { order: 1 }));
    await store.folders.put(folder('b', { order: 5 }));
    await store.folders.put(folder('c', { order: 9 }));
    const mid = await store.folders.query('order', IDBKeyRange.bound(2, 8));
    expect(mid.map((f) => f.id)).toEqual(['b']);
  });
});

describe('Sync envelope on every write (4.2)', () => {
  it('first put initializes rev=1, updatedAt, deviceId, hash', async () => {
    const store = await freshStore();
    await store.folders.put(folder('a'));
    const got = await store.folders.get('a');
    expect(got!.rev).toBe(1);
    expect(typeof got!.updatedAt).toBe('number');
    expect(got!.updatedAt).toBeGreaterThan(0);
    expect(got!.deviceId.length).toBeGreaterThan(0);
    expect(got!.hash.length).toBeGreaterThan(0);
  });

  it('subsequent put bumps rev and refreshes hash for changed content', async () => {
    const store = await freshStore();
    await store.folders.put(folder('a', { name: 'One' }));
    const v1 = await store.folders.get('a');
    await store.folders.put(folder('a', { name: 'Two' }));
    const v2 = await store.folders.get('a');
    expect(v2!.rev).toBe(2);
    expect(v2!.hash).not.toBe(v1!.hash);
    expect(v2!.updatedAt).toBeGreaterThanOrEqual(v1!.updatedAt);
  });
});

describe('Deletes write tombstones for syncable records (4.3)', () => {
  it('delete tombstones and hides the row from normal reads', async () => {
    const store = await freshStore();
    await store.folders.put(folder('a'));
    await store.folders.delete('a');

    // Hidden from the Repo's normal reads...
    expect(await store.folders.get('a')).toBeUndefined();
    expect(await store.folders.query()).toEqual([]);

    // ...but retained underneath as a tombstone with a bumped rev.
    const raw = (await store.db.get('folders', 'a')) as Folder;
    expect(raw.deleted).toBe(true);
    expect(raw.rev).toBe(2);
  });
});

describe('Versioned schema with explicit migrations (4.4)', () => {
  it('all declared stores (incl. searchPostings + syncMeta) exist at v1', async () => {
    const store = await freshStore();
    const names = [...store.db.objectStoreNames];
    for (const def of ALL_STORES) expect(names).toContain(def.name);
    expect(names).toContain('searchPostings');
    expect(names).toContain('syncMeta');
  });

  it('migration v1→v2 upgrades the schema and preserves v1 records', async () => {
    const name = `skeinos-migrate-${dbCounter++}`;
    const v1Only: Migration[] = [
      (db) => {
        db.createObjectStore('folders', { keyPath: 'id' });
      },
    ];

    // Create at v1 and seed a record.
    let db: IDBPDatabase = await openDb(name, v1Only, 1);
    await db.put('folders', { id: 'keep', name: 'survivor' });
    db.close();

    // Reopen at v2 with an appended, add-only migration.
    const v1AndV2: Migration[] = [
      ...v1Only,
      (db2) => {
        db2.createObjectStore('widgets', { keyPath: 'id' });
      },
    ];
    db = await openDb(name, v1AndV2, 2);

    expect([...db.objectStoreNames]).toContain('widgets'); // v2 addition
    const kept = await db.get('folders', 'keep'); // v1 data preserved
    expect(kept).toMatchObject({ id: 'keep', name: 'survivor' });
    db.close();
    await deleteDB(name);
  });
});

describe('Multi-store atomic transactions (4.5)', () => {
  it('a failing transaction rolls back all writes', async () => {
    const store = await freshStore();
    await expect(
      store.tx(['folders', 'tags'], async (t) => {
        await t.objectStore('folders').put(folder('tx'));
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    // Nothing committed in either store.
    expect(await store.db.get('folders', 'tx')).toBeUndefined();
    expect(await store.db.count('tags')).toBe(0);
  });
});

describe('Local-only stores are excluded from sync (4.6)', () => {
  it('the syncable set includes content stores and excludes local-only ones', () => {
    const set = new Set(syncableStores());
    for (const name of ['folders', 'prompts', 'promptFolders', 'profiles', 'tags']) {
      expect(set.has(name as never)).toBe(true);
    }
    for (const name of ['conversations', 'searchPostings', 'comparisons']) {
      expect(set.has(name as never)).toBe(false);
    }
  });
});
