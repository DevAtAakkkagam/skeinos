// Database open + the explicit, ordered, add-only migration list (D3).
//
// One versioned IndexedDB database. Each entry in MIGRATIONS is one schema
// version: index `i` is database version `i + 1`. A shipped migration is NEVER
// edited — schema changes only ever *append* a new step, so every install
// replays the same ordered history and "no data loss" (NFR 8.2) stays testable.

import { openDB, type IDBPDatabase, type IDBPTransaction } from 'idb';
import type { ActiveConversation, ConversationIndex, SearchShard } from '../../shared/types';
import { ALL_STORES, DB_NAME } from './schema';

// A migration may be async to rewrite data (v7): `idb` keeps the versionchange
// transaction alive across awaits on its own stores, and `openDb` awaits each
// step in order before the next runs.
export type Migration = (
  db: IDBPDatabase,
  tx: IDBPTransaction<unknown, string[], 'versionchange'>,
  oldVersion: number,
) => void | Promise<void>;

/** v7 helper: the bare-uuid form of a legacy Claude `nativeId`, or `null` when the
 *  id is already canonical. Two legacy forms exist: `/chat/<uuid>` (the pre-2026-07
 *  config read the row `href`) and `chat:<uuid>` (a pre-v7 runtime running the
 *  remote v2 config read `data-row-key` without normalizing it). */
function legacyClaudeId(nativeId: string): string | null {
  if (nativeId.startsWith('/chat/')) return nativeId.slice('/chat/'.length);
  if (nativeId.startsWith('chat:')) return nativeId.slice('chat:'.length);
  return null;
}

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
  // `term`) to the prefix-shard layout (keyPath `prefix`) per D26/D6.
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
  // v6 — add the local-only `platformState` store (collapsed-list nudge, decoupled
  // from `activeConversations` so the nudge fires on a host's new-chat/home page).
  // Presence-guarded exactly like the v2 `activeConversations` step: a fresh install
  // already has it from the v1 `ALL_STORES` sweep, while an existing database gains
  // it on upgrade. Idempotent either way.
  (db) => {
    if (!db.objectStoreNames.contains('platformState')) {
      db.createObjectStore('platformState', { keyPath: 'platform' });
    }
  },
  // v7 — Claude's 2026-07 UI rewrite changed how conversation ids surface: rows
  // carry `data-row-key="chat:<uuid>"` and the runtime now normalizes both the DOM
  // and URL sources to the BARE uuid (`conversationIdPattern`). Rewrite existing
  // Claude records from the legacy nativeId forms to the bare uuid so folder /
  // pin / tag assignments survive the id change instead of orphaning. Rewrites:
  // `conversations` (id + nativeId), `searchPostings` (posting docIds, deduped in
  // case a transitional install indexed the same doc under both forms), and
  // `activeConversations`. Idempotent: canonical ids pass through untouched, so a
  // replay (or a fresh install, guarded below) is a no-op.
  async (_db, tx, oldVersion) => {
    if (oldVersion === 0) return; // fresh install — nothing legacy to rewrite
    const conv = tx.objectStore('conversations');
    const records = (await conv.getAll()) as ConversationIndex[];
    for (const rec of records) {
      if (rec.platform !== 'claude') continue;
      const canon = legacyClaudeId(rec.nativeId ?? '');
      if (canon === null) continue;
      const newId = `claude::${canon}`;
      const existing = (await conv.get(newId)) as ConversationIndex | undefined;
      await conv.delete(rec.id);
      if (existing) {
        // Both forms exist (transitional dup): keep the canonical record's content
        // but adopt the legacy record's organization where the canonical has none.
        await conv.put({
          ...existing,
          folderId: existing.folderId ?? rec.folderId ?? null,
          tags: existing.tags?.length ? existing.tags : (rec.tags ?? []),
          pinned: existing.pinned ?? rec.pinned,
          archived: existing.archived ?? rec.archived,
          color: existing.color ?? rec.color,
        });
      } else {
        await conv.put({ ...rec, id: newId, nativeId: canon });
      }
    }
    // Postings reference conversations by docId — rewrite the same legacy forms,
    // then drop exact (docId, field) duplicates a transitional index left behind.
    const shards = tx.objectStore('searchPostings');
    let cursor = await shards.openCursor();
    while (cursor) {
      const shard = cursor.value as SearchShard;
      let changed = false;
      for (const term of Object.keys(shard.terms ?? {})) {
        const postings = shard.terms[term];
        for (const p of postings) {
          if (!p.docId.startsWith('claude::')) continue;
          const canon = legacyClaudeId(p.docId.slice('claude::'.length));
          if (canon !== null) {
            p.docId = `claude::${canon}`;
            changed = true;
          }
        }
        if (changed) {
          const seen = new Set<string>();
          shard.terms[term] = postings.filter((p) => {
            const key = `${p.docId} ${p.field}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        }
      }
      if (changed) await cursor.update(shard);
      cursor = await cursor.continue();
    }
    const active = tx.objectStore('activeConversations');
    const activeClaude = (await active.get('claude')) as ActiveConversation | undefined;
    if (activeClaude) {
      const canon = legacyClaudeId(activeClaude.nativeId ?? '');
      if (canon !== null) await active.put({ ...activeClaude, nativeId: canon });
    }
  },
  // v8 — optional `historyBackfilledAt` / `historyBackfillOutcome` fields on
  // `PlatformState` (chatgpt-history-backfill, design D4). Both are optional,
  // non-indexed record fields on a local-only store, so existing `platformState`
  // rows stay valid unchanged and read back with the fields `undefined` — which is
  // exactly the desired "never swept" state for an existing install. This step
  // exists only to record the additive bump as an explicit, append-only version
  // ([STORE], mirroring v3/v5); it is a no-op.
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
    async upgrade(db, oldVersion, newVersion, tx) {
      const target = newVersion ?? migrations.length;
      // Run only steps newer than the on-disk version, in order. Awaited so an
      // async data-rewrite step fully completes before the next step runs.
      for (let v = oldVersion; v < target; v++) {
        await migrations[v]?.(db, tx, oldVersion);
      }
    },
  });
}
