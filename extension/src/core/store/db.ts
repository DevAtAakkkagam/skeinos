// Database open + the explicit, ordered, add-only migration list (D3).
//
// One versioned IndexedDB database. Each entry in MIGRATIONS is one schema
// version: index `i` is database version `i + 1`. A shipped migration is NEVER
// edited — schema changes only ever *append* a new step, so every install
// replays the same ordered history and "no data loss" (NFR 8.2) stays testable.

import { openDB, type IDBPDatabase, type IDBPTransaction } from 'idb';
import { ALL_STORES, DB_NAME } from './schema';

export type Migration = (
  db: IDBPDatabase,
  tx: IDBPTransaction<unknown, string[], 'versionchange'>,
  oldVersion: number,
) => void;

/**
 * Ordered migration list. v1 creates every store + index in the §6 table.
 * Append-only: to evolve the schema, push a new function — never mutate one.
 */
export const MIGRATIONS: Migration[] = [
  // v1 — create all stores and indexes.
  (db) => {
    for (const store of ALL_STORES) {
      const os = db.createObjectStore(store.name, { keyPath: store.keyPath });
      for (const idx of store.indexes) {
        os.createIndex(idx.name, idx.keyPath, { multiEntry: idx.multiEntry ?? false });
      }
    }
  },
  // v2 — add the local-only `activeConversations` store (conversation-filing).
  // Guarded by a presence check so a *fresh* install (whose v1 step already
  // created it from the current ALL_STORES) skips it, while an existing v1
  // database gains the store on upgrade. Idempotent either way.
  (db) => {
    if (!db.objectStoreNames.contains('activeConversations')) {
      db.createObjectStore('activeConversations', { keyPath: 'platform' });
    }
  },
  // v3 — conversation organization state (conversation-context-menu). The new
  // `pinned` / `archived` / `color` fields on `ConversationIndex` are optional,
  // non-indexed, and read with defaults, so existing `conversations` rows are
  // valid as-is and need no rewrite. This step exists only to record the schema
  // evolution as an explicit, append-only version bump ([STORE]); it is a no-op.
  () => {
    // Intentionally empty — additive optional record fields require no structural
    // change to the (schemaless-per-record) IndexedDB object store.
  },
  // v4 — reshape `searchPostings` from the shipped per-term layout (keyPath
  // `term`) to the prefix-shard layout (keyPath `prefix`) per D26/D6/LLD §8.1.
  // Indexing has never run, so the store is empty: drop and recreate with the new
  // key path — no row transformation, no rollback risk. `conversations` (holding
  // `ConversationIndex`) and every syncable store are untouched.
  //
  // Guarded by `oldVersion` so this is idempotent for a *fresh* install: there the
  // v1 step already created `searchPostings` with keyPath `prefix` from the current
  // `ALL_STORES`, so the reshape is a no-op (mirroring the v2 `activeConversations`
  // presence guard's intent). Only an existing pre-v4 database — created when the
  // key path was `term` — is dropped and recreated here.
  (db, _tx, oldVersion) => {
    if (oldVersion === 0) return; // fresh install already has the new key path
    if (db.objectStoreNames.contains('searchPostings')) {
      db.deleteObjectStore('searchPostings');
    }
    db.createObjectStore('searchPostings', { keyPath: 'prefix' });
  },
  // v5 — optional `domain` / `seedId` fields on `Prompt` (prompt-seed-catalog, D-F).
  // Both are optional, non-indexed record fields, so existing `prompts` rows stay
  // valid unchanged and read back with the fields `undefined` — exactly like the v3
  // `ConversationIndex` additions. This step exists only to record the additive bump
  // as an explicit, append-only version ([STORE]); it is a no-op.
  () => {
    // Intentionally empty — additive optional record fields require no structural
    // change to the (schemaless-per-record) IndexedDB object store.
  },
];

/**
 * Open the database, replaying any pending migrations. `version` and
 * `migrations` are injectable so tests can prove the v1→v2 upgrade path against
 * an alternate migration list without touching the production schema.
 */
export function openDb(
  name: string = DB_NAME,
  migrations: Migration[] = MIGRATIONS,
  version: number = migrations.length,
): Promise<IDBPDatabase> {
  return openDB(name, version, {
    upgrade(db, oldVersion, newVersion, tx) {
      const target = newVersion ?? migrations.length;
      // Run only steps newer than the on-disk version, in order.
      for (let v = oldVersion; v < target; v++) {
        migrations[v]?.(db, tx, oldVersion);
      }
    },
  });
}
