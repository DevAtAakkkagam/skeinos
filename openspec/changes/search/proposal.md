## Why

Search is the free tier's second core promise: the host sites give you a flat, un-queryable
conversation list, and Skeinos makes every conversation findable by content with filters and
in-context highlights. It is the widest remaining M2 unblocker — `loading-states` (C11), `shortcuts`
(C16), the `a11y` audit (C34), and the `perf-budget` verification (C35) all build on the search engine
and overlay. With the store (C1) and the Claude adapter (C4) in place, the `searchPostings` store and
the `SearchEngine` / `search.run` contracts that have been stubbed since M0 can finally be filled in.

## What Changes

- Add `core/conversation-index`: an indexing pipeline that takes the Claude adapter's
  `readMessages(nativeId)` output, **normalizes** (lowercase, strip punctuation, light stemming) and
  **tokenizes** it into an `indexedText` + `contentHash`, persists the `ConversationIndex` record, and
  is **idempotent** — an unchanged `contentHash` skips re-indexing. Runs in the service worker (the
  single writer); the content-script adapter only reads the DOM.
- Add `core/search`: the postings engine over `searchPostings` — build, incremental update, query, and
  highlight. **BREAKING (internal, no-data): reshape `searchPostings` from the shipped per-term
  `SearchPosting` (`{ term, docs[] }`, `keyPath: 'term'`) to a prefix-shard** (`{ prefix, terms: {
  [term]: { docId, field, positions[] }[] } }`, `keyPath: 'prefix'`) per **D26/D6/LLD §8.1**. This is a
  store-schema version bump with **no data migration** — indexing has never run, so there are no rows.
- Add query + ranking: parse terms + filters (**platform, date range, folder**, and a
  forward-compatible **tag** dimension), intersect postings, score by term frequency with field boosts
  (title > body) and a recency factor, drive in-context highlighting from stored token positions, and
  page results. Target **< 500 ms over 5,000 conversations**, verified by a synthetic-corpus CI
  benchmark.
- Add the **search overlay UI** (shadow-DOM Preact, `--sk-*` tokens): a command-palette-style search
  with filter controls, full keyboard navigation, highlighted results, and an empty state. Mounts via
  the existing UI harness and drives queries through the existing `search.run` request, refreshing on
  `state.changed` broadcasts.
- Background indexing runs in **synchronous chunks** within the index message (D26): runtime indexing is
  naturally per-conversation, so the ~30 s MV3 worker-death window only matters for the bulk 5k
  benchmark, where backfill is **best-effort**. The durable `chrome.alarms` + persisted-cursor model
  (replacing §8.1's DOM-less "idle callbacks") is deferred to a later change.

Out of scope (separate changes, clean seams left here): tag **assignment/management** (`tags`, C7 — C8
only defines the tag *filter* dimension forward-compatibly, adding **no hard dependency on C7**);
skeleton + "indexing N…" states (`loading-states`, C11); keyboard-shortcut binding for opening search
(`shortcuts`, C16); the standalone NFR budget gate (`perf-budget`, C35 — C8 ships only its own search
benchmark); and durable resumable backfill via alarms.

## Capabilities

### New Capabilities
- `conversation-index`: the ingest pipeline that turns an adapter's `readMessages` output into a
  persisted, idempotent `ConversationIndex` (normalize → tokenize → `contentHash` → store), running in
  the service worker, with a clean seam to the search engine for (re)indexing and removal.
- `search`: the query layer — the prefix-shard postings build/update over `searchPostings`, query
  parsing + filters (platform/date/folder, tag forward-compatible), TF + field-boost + recency ranking,
  position-driven highlighting and paging under the <500ms@5k budget, and the shadow-DOM search overlay
  (palette, filters, keyboard nav, empty state) over the `search.run` messaging contract.

### Modified Capabilities
- `workspace-store`: the `searchPostings` store changes shape from per-term to prefix-shard with a new
  `keyPath` and a schema version bump (no-data migration). This is a spec-level change to the store's
  data model, not just an implementation detail.

## Impact

- **New modules** `extension/src/core/conversation-index/` (ingest pipeline + worker handlers) and
  `extension/src/core/search/` (shard layout, indexer, query engine), plus a `features/search/` Preact
  overlay mounted through the UI harness.
- **Modified** `extension/src/shared/types.ts` (replace `SearchPosting` with the prefix-shard type; add
  the `Query` / `SearchResult` shapes) and `extension/src/core/store/schema.ts` (`searchPostings`
  `keyPath` + DB version bump). The `SearchEngine` interface (LLD §5) and `search.run` request /
  `state.changed` broadcast (LLD §7) already exist and are wired, not introduced.
- **Consumes existing contracts**: the `conversations` + `searchPostings` repos from `workspace-store`,
  the `messaging` request/response + broadcast hub, and the Claude `platform-adapter` `readMessages`
  read op — no direct DOM access from `core/`.
- **No new permissions, no network.** `indexedText`, `searchPostings`, and `ConversationIndex` stay
  local-only on every tier (the privacy hard boundary); indexing and querying stay inside the
  single-writer + shadow-DOM + config-driven-adapter rules.
- **Tested** with Vitest + fake-indexeddb (normalize/tokenize, `contentHash` idempotency, shard
  build/incremental-removal, intersect + ranking + highlight, filter semantics) and a synthetic 5k-doc
  CI benchmark (<500 ms); Playwright on the mock Claude host for the keyboard-only search flow returning
  highlighted results.
- **Docs**: applies the **D26** propagation note — update LLD §8.1's shard prose and the `SearchPosting`
  type/`keyPath` as part of this change.
- **Downstream**: unblocks `loading-states` (C11), `shortcuts` (C16), `a11y` (C34), and `perf-budget`
  (C35); the tag filter activates once `tags` (C7) ships.
