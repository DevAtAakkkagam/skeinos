## Context

The `SearchOverlay` runs `useSearch` → `search.run` (conversations only) and renders one listbox with
keyboard nav over `results`, opening a row via `openConversation`. Slice 3 left a clean navigation seam:
`SidebarShell` already turns an `openPrompt(id)` call into "select Prompts tab + open that prompt's
editor" (`pendingPromptId` → `PromptsPanel`). Slice 2's `prompts.query` kind takes a discriminated
`PromptSelector`, so a new read variant needs no new request kind. The conversation postings index is
conversation-shaped and, per the slice-1 exploration, prompts are intentionally kept out of it.

## Goals / Non-Goals

**Goals:**
- Global search surfaces prompts beside conversations and navigates to a selected prompt in the Prompts
  tab.
- One query, two result groups, one keyboard model; conversation behavior unchanged.
- Prompt matching stays a local in-worker scan of the small library — no postings index, no privacy
  boundary movement.

**Non-Goals:**
- Insertion of a found prompt (C13); prompt content in the postings index; heavy ranking; usage weighting
  (C25).

## Decisions

### D-A — `prompt.search` is a new selector on the existing `prompts.query` kind, not a postings entry
The worker scans the loaded library and returns matches; prompts never enter `searchPostings`. Rationale:
the postings index is built for conversation scale and shape (`nativeId`, platform, positions over long
bodies); the prompt set is tiny and already in memory, so a linear scan is simpler, keeps prompt content
out of the conversation index (privacy + the local-only boundary), and avoids reshaping `SearchResult`.
*Alternative:* index prompts into `searchPostings` with a `docType` discriminator (rejected: polymorphic
reshape of the whole pipeline for a corpus that doesn't need an index).

### D-B — Result shape `PromptSearchResult` reuses `SnippetSegment`
`{ id, title, snippet: SnippetSegment[], targetModels, slug? }`. Reusing the overlay's `SnippetSegment`
means prompt rows highlight identically to conversation rows and share the `Snippet` renderer. The worker
builds the snippet from the first matching field (body/description), falling back to a leading body
excerpt. Rationale: visual + code consistency, minimal new surface.

### D-C — Matching: AND across terms over title/body/description/tags/slug; rank title-over-body
A prompt matches when **every** query term appears (case-insensitively, normalized like conversation
search) in at least one of its searchable fields. Ranking is a light score: a term hit in `title` outweighs
`body`/`description`, with ties broken by `lastUsedAt`/`updatedAt` recency. Rationale: matches the
conversation search's "AND + field boost + recency" feel without a real index. *Alternative:* fuzzy
matching (rejected — overkill for tens–hundreds of prompts; predictable substring/token match is clearer).

### D-D — The overlay composes two hooks over one query text; nav routes by result type
`SearchOverlay` keeps `useSearch` as the owner of `queryText` and feeds that text into
`usePromptSearch(queryText)` (its own debounce + ticket + `state.changed` re-query, mirroring `useSearch`).
The two result arrays render as two labelled groups in a single listbox; the active index spans
`[...conversations, ...prompts]` so ↑/↓ crosses the group boundary seamlessly. Enter/click dispatches by
type: conversation → `openConversation` (unchanged); prompt → `onOpenPrompt(id)` then `onClose`.
*Alternative:* lift query state into the overlay and refactor `useSearch` (rejected: more churn to a
shipped, tested hook than composing beside it).

### D-E — Navigation reuses the slice-3 seam; the overlay stays presentation-only
`SearchOverlay` gains an `onOpenPrompt?: (id) => void` prop; `SidebarShell` passes
`(id) => { setActiveTab('prompts'); setPendingPromptId(id); setSearchOpen(false); }` — the same internal
handler the `bindOpenPrompt` seam exposes externally. The overlay never imports tab/panel state. Rationale:
the navigation target already exists and is tested; slice 4 only triggers it.

### D-F — Combined empty / loading states
The overlay shows its empty state only when **both** groups are empty for a non-empty query; while either
source is in flight it shows the searching state. A group with zero results renders no header (no empty
"Prompts" heading). Rationale: one coherent overlay state machine over two sources.

## Risks / Trade-offs

- **Unified keyboard nav across two arrays is the main complexity.** → Model the active index over a single
  flattened `[conv…, prompt…]` view-model; the row renderer maps an index back to its group. Cover the
  cross-boundary ↑/↓ and Enter-on-each-type with tests.
- **Double debounce (two hooks on the same text).** → Both use the same `DEBOUNCE_MS`; the extra timer is
  negligible and keeps `useSearch` untouched. Acceptable.
- **Prompt search re-runs on every `state.changed`** (like conversation search). → The library is tiny and
  the worker scan is cheap; consistent with the existing overlay's live-refresh behavior.

## Migration Plan

No data/schema/contract-kind migration — the `prompt.search` variant extends an existing kind's selector
union. Rollback reverts the handler/selector additions, `usePromptSearch`, and the overlay/shell wiring;
the overlay returns to conversation-only.

## Open Questions

- **Result ordering between groups** — conversations-then-prompts (fixed) vs. interleaved by score.
  Leaning fixed groups (clearer, matches the design's grouped lists); revisit if users expect a single
  relevance-ranked list.
- **Row affordance for the future insert (C13)** — selecting a prompt opens its editor now; C13 may want a
  secondary "insert" action on the row. Out of scope here; the row shape leaves room for it.
