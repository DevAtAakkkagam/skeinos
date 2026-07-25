## 1. Types and store reshape (no-data migration)

- [x] 1.1 Replace the per-term `SearchPosting` type in `shared/types.ts` with the prefix-shard `SearchShard` (`prefix`; `terms: Record<string, { docId; field: 'title'|'body'; positions: number[] }[]>`), and add the `Query` (terms + platform/date-range/folder/archived/tag filters + paging), `SearchResult` (docId, score, highlighted snippet), and `SearchEngine` interface shapes (none of these exist yet — only the placeholder `SearchPosting` ships today).
- [x] 1.2 Change `searchPostings.keyPath` from `'term'` to `'prefix'` in `core/store/schema.ts` and update `Repo<SearchShard>` wiring in `core/store/index.ts`.
- [x] 1.3 Append a new ordered migration step (the DB is at v3 today — v2 `activeConversations`, v3 org-state — so this is v4) that drops and recreates `searchPostings` with key path `prefix` and bumps the DB version (no row transformation — postings have never been written); keep `conversations`, `activeConversations`, and all syncable stores untouched. Guard the drop/recreate with a presence check (mirroring the v2 `activeConversations` step) so a *fresh* install — which already creates `searchPostings` with the new `prefix` key path from `ALL_STORES` in the v1 step — does not double-create or error, while an existing v3 database is reshaped on upgrade.
- [x] 1.4 Confirm `searchPostings` stays in the local-only set (excluded from `syncableStores`); add/adjust the store unit test asserting the new key path and the no-data migration.
- [x] 1.5 Extend the `Broadcast` union in `shared/messages.ts` so bulk-index progress can be carried (the shipped `state.changed` is `{ kind: 'state.changed'; stores: string[] }` and has no payload slot): add a progress variant — e.g. `{ kind: 'index.progress'; done: number; total: number }` — or an optional progress field on `state.changed`. This is the seam C11's indicator reads (task 3.6); the broadcast hub itself already exists, but the progress payload does not.

## 2. Normalization, tokenization, sharding (pure core)

- [x] 2.1 Implement `normalize(text)` (lowercase, strip punctuation, collapse whitespace, light plural/case stemming) and `tokenize(text)` → positioned tokens in `core/search`, with `field` provenance for title vs body.
- [x] 2.2 Implement `prefixOf(term)` (first two normalized chars, or the whole term when shorter) used identically at index and query time.
- [x] 2.3 Implement `hashContent(normalizedText)` for the `contentHash` idempotency guard.
- [x] 2.4 Unit-test (Vitest): normalization/stemming symmetry between index and query, positions are stable, `prefixOf` handles 1-char and multibyte terms, identical input yields identical hash.

## 3. Conversation indexing pipeline (single writer)

- [x] 3.1 Implement the ingest entry in `core/conversation-index`: take adapter `Message[]`, build title+body normalized text, compute `contentHash`, and upsert the `ConversationIndex` record in the worker — read-modify-writing the existing record so local org-state (`folderId`, `tags`, `pinned`, `archived`, `color`) is preserved and only content fields are overwritten. Note: the pipeline consumes `Message[]` passed over the messaging hub, decoupled from how the adapter sourced them — the shipped Claude `readMessages` reads the currently-rendered DOM and ignores its `nativeId` argument, so *runtime* indexing only ever sees the active conversation (which reinforces the best-effort-bulk stance in 3.5; the 5k benchmark uses a synthetic corpus, not real DOM reads).
- [x] 3.2 Short-circuit when the recomputed `contentHash` equals the stored one (idempotent no-op — no record or postings writes).
- [x] 3.3 On a changed/new conversation, compute the postings diff: re-tokenize the previous `indexedText` (when present) to derive removals, tokenize the new text for additions, and apply per-shard so each affected shard is read-modify-written once.
- [x] 3.4 Implement `remove(id)`: read the record, re-tokenize its `indexedText`, subtract its postings from the shards, and delete the `ConversationIndex` record.
- [x] 3.5 Implement bulk indexing in synchronous chunks (yield between chunks; batch postings per shard within a chunk); persist incrementally so an interrupted run leaves indexed conversations queryable and the rest re-indexable.
- [x] 3.6 Emit the `{ done, total }` progress signal during bulk indexing over the broadcast variant added in 1.5 (seam for the C11 indicator; no indicator UI here).
- [x] 3.7 Integration-test (Vitest + fake-indexeddb): fixture index round-trip, unchanged re-submit writes nothing, edited re-submit replaces only that doc's postings and preserves the record's pin/archive/color/folder/tags, removal clears only that doc's postings, interrupted bulk run resumes without duplicate postings.

## 4. Search engine — query, rank, highlight (single writer)

- [x] 4.1 Implement `search(query)`: normalize query terms, load shards by `prefixOf`, intersect each term's posting lists smallest-list-first (AND semantics).
- [x] 4.2 Apply filters against `ConversationIndex` metadata: `platform`, `updatedAt` range, `folderId`, `archived` (default-exclude archived; include only when the filter requests them — archived conversations stay indexed), and the forward-compatible `tag` filter (no-op when no conversation carries tags; no hard C7 dependency).
- [x] 4.3 Score by term frequency × field boost (title 3.0 > body 1.0) × recency factor; order by score and page (offset/limit).
- [x] 4.4 Build highlighted snippets from stored token `positions` (fixed window around the first match).
- [x] 4.5 Register the `search.run` request kind on the open `RequestContracts` map via declaration merging and wire its handler to call the engine and return `SearchResult[]` via the messaging response (messaging ships no `search.run` kind today; the `SearchEngine` interface is the one defined in 1.1).
- [x] 4.6 Unit/integration-test: AND-only matching, title outranks equivalent body match, filters constrain results, archived excluded by default but returned when requested (and still indexed), paging is score-ordered, tag filter is inert with no tags, snippet highlights matched positions.
- [x] 4.7 Add the synthetic 5,000-conversation CI benchmark asserting query latency < 500 ms; fail the gate on regression.

## 5. Search overlay UI (shadow-DOM, pure view)

- [x] 5.1 Scaffold the search overlay under `ui/` mounted via the existing harness: query input, results list (each row showing its platform logo via `PlatformLogo` / `PLATFORM_LOGOS` from `ui/components/PlatformLogo.tsx`, with conversation origins/URLs from `shared/branding.ts` — the platform-branding capability's logo + origin sources), filter controls (platform, date, folder, archived, and an inert tag control), styled only from `--sk-*` tokens, no hard-coded user-facing strings.
- [x] 5.2 Issue `search.run` on input (debounced) and render highlighted, paged results; re-query on `state.changed`, holding no authoritative state in the view.
- [x] 5.3 Full keyboard operation: open, type, arrow through results, Enter to open the conversation, Esc to close; ARIA roles/labels on input, results, and filters.
- [x] 5.4 Render the empty state when a query matches nothing (no bare empty list).

## 6. End-to-end, docs, and seam check

- [x] 6.1 Real-Chromium E2E over the real worker + IndexedDB: index fixture conversations, then a keyboard-only search returns highlighted results.
- [x] 6.2 E2E: a filtered query (platform/date/folder) constrains results; the empty state shows for a no-match query.
- [x] 6.3 Apply the D26 doc propagation: update 's shard prose to the `{ prefix, terms{} }` shape and confirm the type/`keyPath` match.
- [x] 6.4 Confirm the leftover seams are clean (tag filter inert with a `// C7` marker, progress signal emitted but no indicator UI, no alarms/cursor backfill) and update `docs/OPENSPEC_CHANGES.md` C8 status.
