## Context

`core/store` runs in the service worker — the single writer (CLAUDE.md spine;). MV3 terminates the worker after ~30s idle, so all durable state lives here and the worker rehydrates on wake; there is no memory-only source of truth. Locked decisions this design implements: the `idb` wrapper + typed `Repo` + migration list (D5), the sync envelope wired from day one (D7), and the custom sharded postings store present from the start (D6). Settings live in `chrome.storage.local` (D4) and are out of scope. Record shapes and the store/index list come from the contract; the `WorkspaceStore`/`Repo` interfaces from the contract.

## Goals / Non-Goals

**Goals:**
- Typed `Repo<T>` (`get`/`put`/`delete`/`query`) over a single versioned IndexedDB DB via `idb`.
- The sync envelope enforced uniformly inside `put`/`delete` so feature code cannot forget it.
- An explicit, ordered, add-only migration list with a working v1→v2 example proven by test.
- All stores + indexes from the contract, including `searchPostings` (keyed by `term`, sharded) and `syncMeta`.
- Local-only classification for `conversations`, `searchPostings`, `comparisons`.
- Multi-store atomic transactions via `tx()`.

**Non-Goals:**
- Search indexing/query logic (M2 / the `search` change) — only the empty postings store + its key shape.
- Sync engine, crypto, and backend (M5) — only the envelope fields the engine will later read.
- Messaging/worker wiring (sibling `messaging` change) — the store is callable in-process; *who* calls it is out of scope.
- Settings persistence (`chrome.storage.local`, sibling `settings` change, D4).

## Decisions

### D-1: `idb` wrapper + a typed `Repo<T>`, not raw IndexedDB
A single thin repository is the one place the envelope, tombstones, and indexes are enforced; feature code stays declarative.
- *Alternatives:* Dexie (heavier, opinionated query layer we don't need); raw IndexedDB (verbose, error-prone, easy to forget the envelope). Rejected per D5.

### D-2: Sync envelope + tombstones in the write path from commit one (D7)
`put` centrally bumps `rev`, sets `updatedAt`/`deviceId`, and recomputes `hash`; `delete` tombstones syncable stores. Local-only stores skip the envelope.
- *Rationale:* avoids an M5 retrofit + back-fill of every record on every user's device.
- *Alternative:* add the envelope at M5 — rejected (forces a data migration across the whole install base).

### D-3: One database, explicit add-only migration list
The versioned upgrade callback dispatches to ordered migration steps; a shipped migration is never edited. v1 creates all stores/indexes; a v2 example proves the upgrade path.
- *Alternative:* implicit/auto-derived migrations — rejected (untestable, risky for "no data loss", NFR 8.2).

### D-4: `searchPostings` present now, keyed by `term`, sharded by prefix (D6)
Only the empty store + key shape are created, so the M2 indexer doesn't trigger a schema bump.

### D-5: Local-only classification at the store layer
Each store carries a `synced` flag (a registry) so the future sync engine enumerates only syncable stores; `conversations`/`searchPostings`/`comparisons` are never enumerated for upload. This enforces the privacy boundary (PRIV-1) structurally, not by convention.

### D-6: `deviceId` and content `hash`
`deviceId` is generated once and persisted; `hash` is a stable digest over a record's semantic fields (excluding envelope fields) so the sync engine can skip/equality-check changesets. The exact digest is an implementation choice documented in code.

## Risks / Trade-offs

- **[Hash instability across versions]** → use a canonical serialization + a documented digest; cover with fixed vectors so the value is reproducible.
- **[Migration bug corrupts data]** → add-only list, per-migration tests, no in-place edits; integration tests on `fake-indexeddb`.
- **[Envelope leaks onto local-only records]** → local-only stores explicitly skip the envelope; the classification is asserted in tests.
- **[`fake-indexeddb` diverges from real IDB]** → keep store logic to standard IDB features; a later browser smoke can confirm if needed.

## Migration Plan

Greenfield: ship the schema at v1. There are no persisted users, so rollback is a no-op. The v2 example is a test fixture demonstrating the upgrade path, not a production migration.

## Open Questions

- Exact hash digest (SHA-256 via WebCrypto vs a fast non-crypto 64-bit hash) — decided in implementation; the spec stays behavior-level.
- `deviceId` storage location (a store meta row vs `chrome.storage.local`) — leans `chrome.storage.local` for stability across worker restarts; not load-bearing for this spec.
