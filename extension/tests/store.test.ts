// workspace-store spec coverage (Vitest + fake-indexeddb). Each `describe`
// maps to one spec requirement in openspec/changes/workspace-store.

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteDB, type IDBPDatabase } from 'idb';
import {
  makeWorkspaceStore,
  MIGRATIONS,
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

describe('searchPostings prefix-shard reshape (1.4)', () => {
  it('searchPostings exists with keyPath "prefix" at the current DB version', async () => {
    const name = `skeinos-postings-${dbCounter++}`;
    const db = await openDb(name); // real MIGRATIONS, current version
    try {
      expect([...db.objectStoreNames]).toContain('searchPostings');
      const keyPath = db.transaction('searchPostings').store.keyPath;
      expect(keyPath).toBe('prefix');
    } finally {
      db.close();
      await deleteDB(name);
    }
  });

  it('searchPostings stays excluded from the syncable set', () => {
    expect(syncableStores() as string[]).not.toContain('searchPostings');
  });

  it('no-data v4 migration reshapes a pre-v4 term-keyed store to prefix without touching other data', async () => {
    const name = `skeinos-postings-migrate-${dbCounter++}`;

    // Build a pre-v4 history: the real v1..v3 steps, but with searchPostings
    // created under the SHIPPED per-term layout (keyPath 'term'). This mirrors a
    // database that exists on disk before the reshape ships.
    const preV4: Migration[] = [
      // v1 — create the real stores, but override searchPostings' keyPath to 'term'.
      (db) => {
        for (const store of ALL_STORES) {
          const keyPath = store.name === 'searchPostings' ? 'term' : store.keyPath;
          const os = db.createObjectStore(store.name, { keyPath });
          for (const idx of store.indexes) {
            os.createIndex(idx.name, idx.keyPath, { multiEntry: idx.multiEntry ?? false });
          }
        }
      },
      // v2 + v3 — replay the real (additive / no-op) steps so the history matches.
      MIGRATIONS[1],
      MIGRATIONS[2],
    ];

    // Create at v3 and seed an unrelated, syncable store; seed NOTHING into
    // searchPostings (indexing had never run — the reshape is no-data).
    let db: IDBPDatabase = await openDb(name, preV4, 3);
    expect(db.transaction('searchPostings').store.keyPath).toBe('term'); // pre-reshape
    await db.put('folders', { id: 'keep', name: 'survivor' });
    db.close();

    // Reopen at v4 with the REAL v4 migration appended — this is the shipped step
    // that drops/recreates searchPostings to keyPath 'prefix'.
    const withV4: Migration[] = [...preV4, MIGRATIONS[3]];
    db = await openDb(name, withV4, 4);
    try {
      // searchPostings is now keyed by 'prefix'.
      expect(db.transaction('searchPostings').store.keyPath).toBe('prefix');
      expect(await db.count('searchPostings')).toBe(0);

      // Other stores and their records are unaffected.
      const kept = await db.get('folders', 'keep');
      expect(kept).toMatchObject({ id: 'keep', name: 'survivor' });
      // conversations (holding ConversationIndex) keeps its original key path.
      expect(db.transaction('conversations').store.keyPath).toBe('id');
    } finally {
      db.close();
      await deleteDB(name);
    }
  });

  it('v7 rewrites legacy Claude ids to the bare uuid, preserving organization (no data loss, 8.2)', async () => {
    const name = `skeinos-migrate-v7-${dbCounter++}`;

    // Create a database at v6 (the real pre-v7 history) and seed the legacy state
    // the 2026-07 Claude UI change strands: href-form nativeIds, a transitional
    // `chat:`-prefixed duplicate, postings under both doc ids, and an active record.
    const preV7: Migration[] = MIGRATIONS.slice(0, 6);
    let db: IDBPDatabase = await openDb(name, preV7, 6);
    await db.put('conversations', {
      id: 'claude::/chat/uuid-1',
      platform: 'claude',
      nativeId: '/chat/uuid-1',
      title: 'Filed legacy',
      folderId: 'f1',
      tags: ['t1'],
      pinned: true,
    });
    // Transitional dup: the same conversation ingested under BOTH id forms (an old
    // runtime running the remote v2 config) — canonical form has no organization.
    await db.put('conversations', {
      id: 'claude::/chat/uuid-2',
      platform: 'claude',
      nativeId: '/chat/uuid-2',
      title: 'Dup legacy',
      folderId: 'f2',
      tags: [],
    });
    await db.put('conversations', {
      id: 'claude::chat:uuid-2',
      platform: 'claude',
      nativeId: 'chat:uuid-2',
      title: 'Dup transitional',
      folderId: null,
      tags: [],
    });
    // A non-Claude record must pass through untouched.
    await db.put('conversations', {
      id: 'chatgpt::/c/other',
      platform: 'chatgpt',
      nativeId: '/c/other',
      title: 'Other platform',
      folderId: null,
      tags: [],
    });
    await db.put('searchPostings', {
      prefix: 'qu',
      terms: {
        quantum: [
          { docId: 'claude::/chat/uuid-1', field: 'title', positions: [0] },
          { docId: 'claude::/chat/uuid-2', field: 'title', positions: [1] },
          { docId: 'claude::chat:uuid-2', field: 'title', positions: [1] },
          { docId: 'chatgpt::/c/other', field: 'title', positions: [2] },
        ],
      },
    });
    await db.put('activeConversations', {
      platform: 'claude',
      nativeId: '/chat/uuid-1',
      title: 'Filed legacy',
      updatedAt: 1,
    });
    db.close();

    // Reopen with the REAL full migration list — v7 runs against the seeded state.
    db = await openDb(name, MIGRATIONS, 7);
    try {
      // Legacy ids are gone; canonical records carry the preserved organization.
      expect(await db.get('conversations', 'claude::/chat/uuid-1')).toBeUndefined();
      expect(await db.get('conversations', 'claude::/chat/uuid-2')).toBeUndefined();
      expect(await db.get('conversations', 'claude::uuid-1')).toMatchObject({
        nativeId: 'uuid-1',
        folderId: 'f1',
        tags: ['t1'],
        pinned: true,
      });
      // The dup collapsed into ONE canonical record carrying the organization.
      // (Which title survives the merge is immaterial — the next list ingest
      // refreshes it via the idempotent title-index path.)
      expect(await db.get('conversations', 'claude::uuid-2')).toMatchObject({
        nativeId: 'uuid-2',
        folderId: 'f2',
      });
      expect(await db.get('conversations', 'chatgpt::/c/other')).toBeTruthy();

      // Postings docIds rewritten, the transitional dup posting collapsed.
      const shard = await db.get('searchPostings', 'qu');
      const docIds = shard.terms.quantum.map((p: { docId: string }) => p.docId);
      expect(docIds).toEqual(['claude::uuid-1', 'claude::uuid-2', 'chatgpt::/c/other']);

      // The active-conversation record follows the id change.
      expect(await db.get('activeConversations', 'claude')).toMatchObject({ nativeId: 'uuid-1' });
    } finally {
      db.close();
      await deleteDB(name);
    }
  });
});
