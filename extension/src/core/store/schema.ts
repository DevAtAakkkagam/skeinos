// The store/index map (LLD §6 table) — the single source of truth for the
// IndexedDB schema. The migration list (db.ts) creates exactly these stores and
// indexes at v1; the `synced` flag drives the local-only/syncable classification
// (D5) so the future sync engine enumerates only syncable stores structurally,
// not by convention. Local-only stores (`conversations`, `searchPostings`,
// `comparisons`) are never uploaded (PRIV-1).

export interface IndexDef {
  /** Index name, also used as the queryable name in `Repo.query`. */
  name: string;
  keyPath: string;
  /** `true` for `tags*`-style multiEntry array indexes. */
  multiEntry?: boolean;
}

export interface StoreDef {
  name: string;
  keyPath: string;
  indexes: IndexDef[];
  /** Whether records here participate in sync (carry + stamp the envelope). */
  synced: boolean;
}

export const DB_NAME = 'skeinos';

/**
 * Canonical store definitions. Order is irrelevant; lookups are by name.
 * Mirrors the LLD §6 table exactly.
 */
export const STORES = {
  folders: {
    name: 'folders',
    keyPath: 'id',
    indexes: [
      { name: 'parentId', keyPath: 'parentId' },
      { name: 'order', keyPath: 'order' },
    ],
    synced: true,
  },
  conversations: {
    name: 'conversations',
    keyPath: 'id',
    indexes: [
      { name: 'platform', keyPath: 'platform' },
      { name: 'folderId', keyPath: 'folderId' },
      { name: 'updatedAt', keyPath: 'updatedAt' },
      { name: 'tags', keyPath: 'tags', multiEntry: true },
    ],
    synced: false,
  },
  prompts: {
    name: 'prompts',
    keyPath: 'id',
    indexes: [
      { name: 'promptFolderId', keyPath: 'promptFolderId' },
      { name: 'tags', keyPath: 'tags', multiEntry: true },
      { name: 'lastUsedAt', keyPath: 'lastUsedAt' },
    ],
    synced: true,
  },
  promptFolders: {
    name: 'promptFolders',
    keyPath: 'id',
    indexes: [{ name: 'parentId', keyPath: 'parentId' }],
    synced: true,
  },
  profiles: {
    name: 'profiles',
    keyPath: 'id',
    indexes: [{ name: 'name', keyPath: 'name' }],
    synced: true,
  },
  tags: {
    name: 'tags',
    keyPath: 'id',
    indexes: [{ name: 'label', keyPath: 'label' }],
    synced: true,
  },
  comparisons: {
    name: 'comparisons',
    keyPath: 'id',
    indexes: [{ name: 'createdAt', keyPath: 'createdAt' }],
    synced: false,
  },
  // The active conversation per platform (conversation-filing). Keyed by
  // `platform` — one record each — so the side panel's current-conversation card
  // survives MV3 worker death (SW-2). Local-only routing metadata, never synced.
  activeConversations: {
    name: 'activeConversations',
    keyPath: 'platform',
    indexes: [],
    synced: false,
  },
  // Keyed by `term`, sharded by term prefix (D6). Indexing logic lands in M2.
  searchPostings: {
    name: 'searchPostings',
    keyPath: 'term',
    indexes: [],
    synced: false,
  },
  // Sync bookkeeping (cursors/state). Not a syncable content store itself.
  syncMeta: {
    name: 'syncMeta',
    keyPath: 'id',
    indexes: [
      { name: 'rev', keyPath: 'rev' },
      { name: 'updatedAt', keyPath: 'updatedAt' },
      { name: 'deleted', keyPath: 'deleted' },
    ],
    synced: false,
  },
} as const satisfies Record<string, StoreDef>;

export type StoreName = keyof typeof STORES;

export const ALL_STORES: StoreDef[] = Object.values(STORES);

/** Names of stores whose records carry + stamp the sync envelope. */
export function syncableStores(): StoreName[] {
  return (Object.keys(STORES) as StoreName[]).filter((n) => STORES[n].synced);
}
