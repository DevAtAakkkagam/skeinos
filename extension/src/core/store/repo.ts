// Typed repository over one object store — the only persistence surface feature
// code touches (D1). It centralizes three invariants:
//   · syncable `put` stamps the envelope (rev/updatedAt/deviceId/hash);
//   · syncable `delete` writes a tombstone instead of removing the row;
//   · tombstoned rows are hidden from normal reads (`get`/`query`).
// Local-only stores skip all of the above — their records carry no envelope.

import type { IDBPDatabase } from 'idb';
import type { SyncMeta } from '../../shared/types';
import type { StoreDef } from './schema';
import { stampEnvelope } from './envelope';

export interface Repo<T> {
  get(key: string): Promise<T | undefined>;
  put(rec: T): Promise<void>;
  delete(key: string): Promise<void>;
  query(index?: string, range?: IDBKeyRange): Promise<T[]>;
}

export function makeRepo<T>(db: IDBPDatabase, store: StoreDef): Repo<T> {
  const isSynced = store.synced;

  function isTombstone(rec: unknown): boolean {
    return isSynced && !!(rec as Partial<SyncMeta> | undefined)?.deleted;
  }

  return {
    async get(key) {
      const rec = await db.get(store.name, key);
      return isTombstone(rec) ? undefined : (rec as T | undefined);
    },

    async put(rec) {
      if (!isSynced) {
        await db.put(store.name, rec);
        return;
      }
      const key = (rec as Record<string, unknown>)[store.keyPath] as string;
      const prev = (await db.get(store.name, key)) as (T & SyncMeta) | undefined;
      const stamped = await stampEnvelope(rec as unknown as T & SyncMeta, prev);
      await db.put(store.name, stamped);
    },

    async delete(key) {
      if (!isSynced) {
        await db.delete(store.name, key);
        return;
      }
      const prev = (await db.get(store.name, key)) as (T & SyncMeta) | undefined;
      if (!prev) return; // nothing to tombstone
      const tomb = await stampEnvelope({ ...prev, deleted: true }, prev);
      await db.put(store.name, tomb);
    },

    async query(index, range) {
      const rows = index
        ? await db.getAllFromIndex(store.name, index, range)
        : await db.getAll(store.name, range);
      return (rows as T[]).filter((r) => !isTombstone(r));
    },
  };
}
