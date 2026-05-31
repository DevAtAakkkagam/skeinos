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
