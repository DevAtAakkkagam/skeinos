## 1. Types and store reshape (no-data migration)

- [ ] 1.1 Replace the per-term `SearchPosting` type in `shared/types.ts` with the prefix-shard `SearchShard` (`prefix`; `terms: Record<string, { docId; field: 'title'|'body'; positions: number[] }[]>`), and add the `Query` (terms + platform/date-range/folder/tag filters + paging) and `SearchResult` (docId, score, highlighted snippet) shapes.
- [ ] 1.2 Change `searchPostings.keyPath` from `'term'` to `'prefix'` in `core/store/schema.ts` and update `Repo<SearchShard>` wiring in `core/store/index.ts`.
- [ ] 1.3 Add the ordered migration that drops and recreates `searchPostings` with key path `prefix` and bumps the DB version (no row transformation — postings have never been written); keep `conversations` and all syncable stores untouched.
- [ ] 1.4 Confirm `searchPostings` stays in the local-only set (excluded from `syncableStores`); add/adjust the store unit test asserting the new key path and the no-data migration.

## 2. Normalization, tokenization, sharding (pure core)

- [ ] 2.1 Implement `normalize(text)` (lowercase, strip punctuation, collapse whitespace, light plural/case stemming) and `tokenize(text)` → positioned tokens in `core/search`, with `field` provenance for title vs body.
- [ ] 2.2 Implement `prefixOf(term)` (first two normalized chars, or the whole term when shorter) used identically at index and query time.
- [ ] 2.3 Implement `hashContent(normalizedText)` for the `contentHash` idempotency guard.
- [ ] 2.4 Unit-test (Vitest): normalization/stemming symmetry between index and query, positions are stable, `prefixOf` handles 1-char and multibyte terms, identical input yields identical hash.

## 3. Conversation indexing pipeline (single writer)

- [ ] 3.1 Implement the ingest entry in `core/conversation-index`: take adapter `Message[]`, build title+body normalized text, compute `contentHash`, and upsert the `ConversationIndex` record in the worker.
- [ ] 3.2 Short-circuit when the recomputed `contentHash` equals the stored one (idempotent no-op — no record or postings writes).
- [ ] 3.3 On a changed/new conversation, compute the postings diff: re-tokenize the previous `indexedText` (when present) to derive removals, tokenize the new text for additions, and apply per-shard so each affected shard is read-modify-written once.
- [ ] 3.4 Implement `remove(id)`: read the record, re-tokenize its `indexedText`, subtract its postings from the shards, and delete the `ConversationIndex` record.
- [ ] 3.5 Implement bulk indexing in synchronous chunks (yield between chunks; batch postings per shard within a chunk); persist incrementally so an interrupted run leaves indexed conversations queryable and the rest re-indexable.
- [ ] 3.6 Emit a `{ done, total }` progress signal over `state.changed` during bulk indexing (seam for the C11 indicator; no indicator UI here).
- [ ] 3.7 Integration-test (Vitest + fake-indexeddb): fixture index round-trip, unchanged re-submit writes nothing, edited re-submit replaces only that doc's postings, removal clears only that doc's postings, interrupted bulk run resumes without duplicate postings.

## 4. Search engine — query, rank, highlight (single writer)

- [ ] 4.1 Implement `search(query)`: normalize query terms, load shards by `prefixOf`, intersect each term's posting lists smallest-list-first (AND semantics).
- [ ] 4.2 Apply filters against `ConversationIndex` metadata: `platform`, `updatedAt` range, `folderId`, and the forward-compatible `tag` filter (no-op when no conversation carries tags; no hard C7 dependency).
- [ ] 4.3 Score by term frequency × field boost (title 3.0 > body 1.0) × recency factor; order by score and page (offset/limit).
- [ ] 4.4 Build highlighted snippets from stored token `positions` (fixed window around the first match).
- [ ] 4.5 Wire `search.run` to call the engine and return `SearchResult[]` via the existing messaging response (`SearchEngine` interface already declared).
- [ ] 4.6 Unit/integration-test: AND-only matching, title outranks equivalent body match, filters constrain results, paging is score-ordered, tag filter is inert with no tags, snippet highlights matched positions.
- [ ] 4.7 Add the synthetic 5,000-conversation CI benchmark asserting query latency < 500 ms; fail the gate on regression.

## 5. Search overlay UI (shadow-DOM, pure view)

- [ ] 5.1 Scaffold the search overlay under `ui/` mounted via the existing harness: query input, results list, filter controls (platform, date, folder, and an inert tag control), styled only from `--sk-*` tokens, no hard-coded user-facing strings.
- [ ] 5.2 Issue `search.run` on input (debounced) and render highlighted, paged results; re-query on `state.changed`, holding no authoritative state in the view.
- [ ] 5.3 Full keyboard operation: open, type, arrow through results, Enter to open the conversation, Esc to close; ARIA roles/labels on input, results, and filters.
- [ ] 5.4 Render the empty state when a query matches nothing (no bare empty list).

## 6. End-to-end, docs, and seam check

- [ ] 6.1 Real-Chromium E2E over the real worker + IndexedDB: index fixture conversations, then a keyboard-only search returns highlighted results.
- [ ] 6.2 E2E: a filtered query (platform/date/folder) constrains results; the empty state shows for a no-match query.
- [ ] 6.3 Apply the D26 doc propagation: update LLD §8.1's shard prose to the `{ prefix, terms{} }` shape and confirm the type/`keyPath` match.
- [ ] 6.4 Confirm the leftover seams are clean (tag filter inert with a `// C7` marker, progress signal emitted but no indicator UI, no alarms/cursor backfill) and update `docs/OPENSPEC_CHANGES.md` C8 status.
