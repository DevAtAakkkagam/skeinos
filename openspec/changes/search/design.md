## Context

The store (C1) shipped a `searchPostings` store, a `SearchPosting` type, and a `SearchEngine`
interface; messaging (C2) shipped the `search.run` request and `state.changed` broadcast; the Claude
adapter (C4) shipped `readMessages(nativeId): Promise<Message[]>`. None of the search *behavior* exists
— `searchPostings` has never been written. This change fills that gap end to end: ingest → index →
query → overlay.

Three architecture rules dominate the design:

1. **Service worker is the single writer.** Tokenization and all `searchPostings` writes happen in the
   SW; the content-script adapter only reads the DOM (`readMessages`) and ships `Message[]` over the
   messaging hub.
2. **No memory-only SW state.** Postings and `ConversationIndex` live in IndexedDB; the SW rehydrates on
   wake. The DOM-less SW cannot use `requestIdleCallback`, so §8.1's "idle callbacks" do not apply.
3. **Privacy hard boundary.** `indexedText`, `searchPostings`, and `ConversationIndex` are local-only on
   every tier and never enter the sync envelope.

Authoritative decisions this design implements: **D6** (custom sharded postings index), **D26** (prefix
shards, synchronous-chunk indexing, tag filter forward-compatible, no-data migration), **D18**
(downstream indexing indicator — out of scope here but we expose a progress signal it can read later).

## Goals / Non-Goals

**Goals:**
- An idempotent ingest pipeline: `readMessages → normalize → tokenize → contentHash → ConversationIndex`,
  re-indexing only when `contentHash` changes.
- A prefix-shard postings layout that keeps individual records small and supports incremental add/remove
  per document.
- Query parsing + filters (platform / date / folder; tag forward-compatible), TF + field-boost + recency
  ranking, position-driven highlighting, and paging — **< 500 ms @ 5k docs** in a CI benchmark.
- A keyboard-operable, ARIA-labelled search overlay over `search.run`, tokens-only styling.

**Non-Goals:**
- Durable resumable bulk backfill (`chrome.alarms` + persisted cursor) — deferred; bulk indexing is
  best-effort this cut.
- Tag *assignment/management* UI (C7) and the "indexing N…" indicator UI (C11) — only the seams.
- Fuzzy / typo-tolerant / semantic search — exact normalized-token match only.
- Cross-platform indexing beyond Claude — other adapters land in C17; the pipeline is platform-agnostic.

## Decisions

### D-1: Postings layout — prefix shards, 2-char prefix

`searchPostings` is keyed by a **term prefix**, each record a shard holding many terms:

```ts
interface SearchShard {                 // local-only; keyPath: 'prefix'
  prefix: string;                       // first 2 normalized chars of every term within
  terms: Record<string,               // term -> postings
    { docId: string; field: 'title' | 'body'; positions: number[] }[]>;
}
```

**Prefix length = 2.** One char (~≤36 shards) makes shards huge and serializes most writes onto a few
records; three chars approach one-record-per-term (the write amplification D26 rejects). Two chars give
hundreds of realistically-populated shards over a ~10–50k-term vocabulary, each holding dozens of terms —
small records, and query terms sharing a prefix share one shard read. Terms shorter than 2 chars use the
whole term as the prefix (so `"a"` lands in shard `"a"`). Prefix is computed from the **normalized**
term, so sharding and lookup use the identical function.

_Alternatives:_ per-term records (what shipped) — simplest reads but D26-rejected write amplification on
re-index; a single monolithic postings blob — fails the "keep records small" goal and serializes all
writes.

### D-2: Incremental removal — re-tokenize the old `indexedText`, no reverse map

To subtract a document's postings on update or delete, we re-tokenize its **previous** `indexedText`
(read the existing `ConversationIndex` before overwriting/deleting) to recover the exact `(prefix, term)`
set it contributed, then remove that doc's entries from those shards. Updates compute old-set and new-set
and apply the diff; deletes apply old-set removal only.

This keeps `ConversationIndex` the **single source of truth** — postings are fully derivable from it, no
second `docId → terms[]` store to keep consistent. Trade-off: an update re-tokenizes old text (cheap CPU)
to avoid maintaining a parallel index (a consistency liability under the single-writer + crash-on-idle
model). Chosen over a reverse-map store for exactly that reason.

### D-3: Idempotent ingest, indexing in the SW

The content script's adapter returns `Message[]`; the SW concatenates title + message bodies, normalizes
(lowercase, strip punctuation, collapse whitespace, light stemming), and computes a `contentHash` over
the normalized text. If the stored `ConversationIndex.contentHash` is unchanged, indexing is a no-op
(idempotent — re-visiting a conversation costs one hash). Otherwise the SW writes the new
`ConversationIndex` and applies the postings diff (D-2). Field provenance (`title` vs `body`) is tracked
per token so ranking can boost titles and highlighting can target either field.

### D-4: Synchronous-chunk indexing; expose a progress count

Runtime indexing is **per-conversation** (one `readMessages` result at a time, as conversations are
observed/opened), so it never approaches the ~30 s worker-death window. Bulk indexing (the 5k benchmark,
or a future "index everything") processes conversations in **synchronous chunks within the index
message**, yielding between chunks; if the worker dies mid-bulk, already-indexed conversations persist
and the rest re-index on next visit (best-effort). The indexer exposes a `{ done, total }` progress
count via `state.changed` so C11's indicator can render it later — but C8 ships no indicator UI. The
durable `chrome.alarms` + persisted-cursor model is explicitly deferred (D26).

### D-5: Query — parse, intersect, rank, highlight, page

`search.run` carries a `Query` (terms + filters). The engine normalizes query terms with the same
function, loads the relevant shards by prefix, intersects each term's posting lists (AND semantics),
applies filters, then scores:

```
score(doc) = Σ_term  tf(term,doc) · fieldBoost(field)   ·  recency(updatedAt)
             fieldBoost: title 3.0, body 1.0            recency: mild decay, newer ranks higher
```

Filters are applied against `ConversationIndex` metadata: `platform`, `updatedAt` range, `folderId`, and
**`tags`** — the `Query.tag` field and filtering logic exist and are spec'd, but since tag *assignment*
ships in C7, with no tags present the filter is a no-op (forward-compatible, no hard C7 dependency).
Stored `positions` drive in-context snippet highlighting; results are paged (offset/limit) and ordered by
score. Returned `SearchResult[]` matches the LLD §5 shape.

### D-6: `searchPostings` reshape — no-data store migration

The schema change (per-term → prefix-shard, `keyPath` `'term'` → `'prefix'`) bumps the IndexedDB version.
Because indexing has never run, the old store is empty: the migration **drops and recreates**
`searchPostings` with the new `keyPath` — no row transformation, no rollback risk. `ConversationIndex`
already exists from C1 and is unchanged. This is the spec-level `workspace-store` modification noted in
the proposal.

### D-7: Overlay UI — palette over `search.run`, tokens only

A command-palette-style overlay mounted through the existing UI harness (shadow DOM, `--sk-*` tokens, no
host classes, no hard-coded strings): a query input, filter controls (platform / date / folder; a tag
control present but inert until C7), a results list with highlighted snippets, and an empty state. Fully
keyboard-operable (open, type, arrow through results, Enter to open, Esc to close) and ARIA-labelled. It
is a pure view over worker state: it issues `search.run` and re-queries on `state.changed`.

## Risks / Trade-offs

- **[Shard write contention on bulk index]** Many docs sharing a hot prefix (`"th"`, `"co"`) serialize
  read-modify-write on one shard → batch postings per shard within a chunk so each hot shard is written
  once per chunk, not once per doc.
- **[Re-tokenization cost on update (D-2)]** Re-tokenizing old text on every change adds CPU → bounded by
  one conversation's text and gated by the `contentHash` check, so it only runs on genuine changes; far
  cheaper than the consistency cost of a parallel reverse index.
- **[<500ms@5k budget]** Large intersections / hot shards could blow the budget → the CI benchmark is a
  merge gate; AND-intersect smallest-list-first, cap positions stored per term, and page early.
- **[Best-effort bulk backfill (D-4)]** A mid-bulk worker death leaves some conversations unindexed →
  acceptable: they re-index on next visit, and the durable model is a named follow-up; the progress count
  makes the gap observable.
- **[Light stemming over-collapses]** Aggressive stemming hurts precision → keep stemming light
  (plural/case folding only) and apply the identical function to index and query so they never diverge.
- **[Tag filter dead code until C7]** Shipping inert tag-filter paths risks rot → cover the no-op path
  with a test now and leave a `// C7` seam comment so activation is a wiring change, not a redesign.

## Migration Plan

1. Land the type + schema reshape (D-6): replace `SearchPosting` with `SearchShard`, set
   `searchPostings.keyPath = 'prefix'`, bump DB version with a drop/recreate migration (no data).
2. Land `core/conversation-index` (ingest) and `core/search` (shard indexer + query) behind the existing
   `SearchEngine` / `search.run` contracts.
3. Land the overlay UI.
4. Apply the D26 doc propagation (LLD §8.1 prose + type/`keyPath`).

**Rollback:** the change is additive over an empty postings store; reverting the schema bump and modules
leaves `ConversationIndex` and all synced data untouched (postings are derivable, never a source of
truth). No user data is at risk at any step.

## Open Questions

- **Stemmer scope:** ship a tiny hand-rolled plural/case folder, or pull a small stemming dep? Leaning
  hand-rolled to avoid a dependency and keep index/query symmetric — confirm during T2.5.
- **Snippet window:** fixed character window vs. sentence-aware around the first matched position — start
  with a fixed window, revisit if highlights read poorly.
- **Multi-term semantics:** AND across terms is assumed; do we need quoted phrases / exact-position
  matching in this cut? Default AND-only; phrases are a later enhancement unless a spec scenario demands
  them.
