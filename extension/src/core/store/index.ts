// WorkspaceStore — the core/store facade (LLD §5). One typed `Repo` per store,
// `tx()` for multi-store atomic writes, and the syncable-store enumeration the
// future sync engine uses. Lives in the service worker (the single writer);
// content scripts/UI reach it only via messaging.

import type { IDBPDatabase, IDBPTransaction } from 'idb';
import type {
  Comparison,
  ConversationIndex,
  Folder,
  InstructionProfile,
  Prompt,
  PromptFolder,
  SearchPosting,
  Tag,
} from '../../shared/types';
import { openDb } from './db';
import { makeRepo, type Repo } from './repo';
import { STORES, syncableStores, type StoreName } from './schema';

export type { Repo } from './repo';
export { syncableStores, STORES, type StoreName } from './schema';
export { openDb, MIGRATIONS, type Migration } from './db';
export { contentHash, getDeviceId } from './envelope';
export { workspaceStore, __resetWorkspaceStore } from './instance';

export type Txn = IDBPTransaction<unknown, string[], 'readwrite'>;

export interface WorkspaceStore {
  folders: Repo<Folder>;
  conversations: Repo<ConversationIndex>;
  prompts: Repo<Prompt>;
  promptFolders: Repo<PromptFolder>;
  profiles: Repo<InstructionProfile>;
  tags: Repo<Tag>;
  comparisons: Repo<Comparison>;
  searchPostings: Repo<SearchPosting>;
  /** Names of stores eligible for sync (envelope-carrying). */
  syncableStores(): StoreName[];
  /** Run `fn` across `stores` in one transaction; commit all or none. */
  tx<R>(stores: string[], fn: (t: Txn) => Promise<R>): Promise<R>;
  /** Underlying handle, for advanced/in-tx access. */
  readonly db: IDBPDatabase;
}

/** Open the database and build the facade. */
export async function openWorkspaceStore(name?: string): Promise<WorkspaceStore> {
  const db = await openDb(name);
  return makeWorkspaceStore(db);
}

/** Build the facade over an already-open database. */
export function makeWorkspaceStore(db: IDBPDatabase): WorkspaceStore {
  return {
    db,
    folders: makeRepo<Folder>(db, STORES.folders),
    conversations: makeRepo<ConversationIndex>(db, STORES.conversations),
    prompts: makeRepo<Prompt>(db, STORES.prompts),
    promptFolders: makeRepo<PromptFolder>(db, STORES.promptFolders),
    profiles: makeRepo<InstructionProfile>(db, STORES.profiles),
    tags: makeRepo<Tag>(db, STORES.tags),
    comparisons: makeRepo<Comparison>(db, STORES.comparisons),
    searchPostings: makeRepo<SearchPosting>(db, STORES.searchPostings),
    syncableStores,
    async tx(stores, fn) {
      const t = db.transaction(stores, 'readwrite') as Txn;
      try {
        const result = await fn(t);
        await t.done;
        return result;
      } catch (err) {
        try {
          t.abort();
        } catch {
          // already aborted/committed — the original error is what matters
        }
        // Swallow the transaction's own abort rejection so it isn't an
        // unhandled rejection; the caller's error (`err`) is what propagates.
        t.done.catch(() => {});
        throw err;
      }
    },
  };
}
