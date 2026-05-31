## 1. Types & schema

- [x] 1.1 Define record types + the `SyncMeta` envelope in `shared/` (`Folder`, `ConversationIndex`, `Prompt`, `PromptVar`, `InstructionProfile`, `Tag`, `Comparison`) per LLD §6
- [x] 1.2 Declare the store/index map (LLD §6 table) incl. `searchPostings` (key `term`, sharded by prefix) and `syncMeta`, with a `synced` classification per store

## 2. Repo + envelope

- [x] 2.1 Implement `openDb()` over `idb` with a versioned upgrade that dispatches to an ordered, add-only migration list (v1 creates all stores/indexes)
- [x] 2.2 Implement `Repo<T>` (`get`/`put`/`delete`/`query`) bound to a store
- [x] 2.3 Centralize the sync-envelope stamp in `put` (bump `rev`, set `updatedAt`/`deviceId`, recompute `hash`); skip for local-only stores
- [x] 2.4 Implement tombstoning `delete` for syncable stores; `get` hides tombstoned rows from normal reads
- [x] 2.5 Implement `tx(stores, fn)` for multi-store atomic transactions
- [x] 2.6 Provision a persistent `deviceId` and a stable content `hash` (document the digest)

## 3. WorkspaceStore facade

- [x] 3.1 Expose one `Repo` per store via a `WorkspaceStore` facade (LLD §5) plus a syncable-store enumeration helper

## 4. Tests (Vitest + fake-indexeddb)

- [x] 4.1 CRUD round-trip + index-range query (spec: workspace-store)
- [x] 4.2 Envelope: first `put` initializes `rev=1`/`updatedAt`/`deviceId`/`hash`; re-`put` bumps `rev` and refreshes `hash`
- [x] 4.3 Delete writes a tombstone (`deleted:true`, bumped `rev`) and is hidden from normal `get`
- [x] 4.4 Migration v1→v2 upgrades the schema and preserves v1 records
- [x] 4.5 `tx` rollback: a partial failure writes nothing
- [x] 4.6 Local-only classification: the syncable set excludes `conversations`/`searchPostings`/`comparisons`
