## Why

Every workspace feature (folders, search, tags, prompts, profiles, tier limits, sync) reads and writes durable on-device state, and the service worker is the single writer to it. Nothing in M1–M8 can persist anything until this store exists — it is the widest unblocker on the LLD critical path (M0 task T0.3).

## What Changes

- Add `core/store`: one versioned IndexedDB database accessed through the `idb` wrapper (D5), never raw IndexedDB from feature code.
- Define the typed `Repo<T>` interface (`get`/`put`/`delete`/`query`) and a `WorkspaceStore` facade exposing one repo per store (`folders`, `conversations`, `prompts`, `promptFolders`, `profiles`, `tags`, `comparisons`) plus `searchPostings` and `syncMeta`.
- Implement the schema and an **explicit, add-only migration list** (single versioned DB).
- Wire the **sync envelope from day one** (D7): every `put()` bumps `rev`, sets `updatedAt`/`deviceId`, recomputes `hash`; `delete()` writes a tombstone (`deleted: true`) instead of removing syncable rows.
- Include the `searchPostings` store (keyed by `term`, sharded by prefix) in the M0 schema even though indexing logic lands in M2 (D6).
- Classify `conversations`, `searchPostings`, and `comparisons` as **local-only** (never-sync) at the store layer.
- Add `tx()` for multi-store atomic transactions.

## Capabilities

### New Capabilities
- `workspace-store`: the on-device persistence layer — versioned IndexedDB schema, typed `Repo<T>` CRUD with the sync envelope + tombstones, the migration list, transactions, and the local-only/syncable store classification.

### Modified Capabilities
<!-- None — greenfield store; no existing spec changes behavior. -->

## Impact

- **New module** `extension/src/core/store/` and `shared/` type defs for the records + the `SyncMeta` envelope.
- **New dependency**: `idb`. No network or runtime services introduced.
- **Write contract**: establishes the envelope/tombstone semantics every later syncable record relies on. Getting this wrong forces an M5 data migration across all users, so it is wired now (D7), not retrofitted.
- **Tested** with Vitest + `fake-indexeddb`: CRUD round-trip, envelope/tombstone behavior, migration v1→v2, transaction atomicity, and the local-only classification.
- **Downstream**: unblocks `folders`, `tags`, `search`, `tier-gate`, `import-export`, `prompts-library`, and `crypto`. Independent of `messaging` and `settings` (D4).
