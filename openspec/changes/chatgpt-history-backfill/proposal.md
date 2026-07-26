## Why

Skeinos only ever indexes the conversations a host has chosen to render. On ChatGPT that is a
fraction of the user's history: measured live on 2026-07-26, a signed-in account showed **55 rows in
the sidebar out of 137 actual conversations** — 60% of the user's chats were invisible to folders,
tags, and search until they happened to scroll their ChatGPT sidebar to the very end. Organization
and search over "all my chats" is the product's core promise, so a silently truncated corpus is a
correctness problem, not a nicety.

The same probe showed this is a ChatGPT-specific mechanism, and that fixing it is cheap and
one-time: ChatGPT's sidebar is **append-only** (rows accumulate and are never recycled — all 137
were still in the DOM across probe runs minutes apart), and `conversation.ingest` is additive and
content-hash gated. So a single scroll-to-the-end sweep permanently captures the backlog, after
which normal top-of-list ingest keeps it current.

## What Changes

- Add an optional `behaviors.historyExpansion` block to `AdapterConfig`, with a `mode` enum whose
  only implemented member is `scroll`. The enum exists so the confirmed-but-unbuilt `route` mode
  (Claude's full list lives at `/recents`, not in its sidebar) slots in later without a config
  migration.
- Add `expandHistory(opts)` to the `PlatformAdapter` contract: a config-driven, best-effort sweep
  that repeatedly scrolls the host's conversation scroller to its end until the row count and
  scroll height stop growing, then restores the user's original scroll position. Adapters whose
  config omits `historyExpansion` resolve immediately as a no-op.
- Discover the scroll container **at runtime** rather than adding a selector. The probe found the
  real scroller is never the configured `conversationList` element — it is an ancestor on
  ChatGPT/Gemini and a descendant on Claude/Perplexity. A bidirectional walk picking the element
  with the largest `scrollHeight - clientHeight` found it correctly on all four platforms, and adds
  no new selector that can break.
- Run the sweep **once per install per platform**, on the content script's ready path, gated by
  durable state so it never repeats on subsequent page loads.
- Suspend list ingest for the duration of the sweep and ingest once at the end, so partially-loaded
  snapshots never determine recency stamps.
- Stamp newly-discovered backfilled conversations **below** the oldest already-indexed record, so a
  backfill cannot reorder the side panel.
- Enable `historyExpansion: { mode: 'scroll' }` in the ChatGPT config and bump its `configVersion`.

Not in scope: `route` mode (Claude), any change to Gemini or Perplexity — the same probe measured
their sidebars as already showing the account's full history (17 and 9 rows, unchanged by
scrolling), so they have no gap to close.

## Capabilities

### New Capabilities

None. This extends the existing adapter contract rather than introducing a new capability.

### Modified Capabilities

- `platform-adapter`: the `AdapterConfig` schema gains an optional, validated `historyExpansion`
  behavior; the `PlatformAdapter` contract gains `expandHistory`; config-driven read operations gain
  the sweep and its runtime scroller discovery, stop conditions, and bounds.
- `conversation-index`: title-ingest recency stamping gains a rule for backfilled conversations —
  newly-discovered records stamp below the oldest existing record instead of at "now", so a
  backfill preserves rather than inverts list order.
- `adapter-chatgpt`: the ChatGPT config enables `historyExpansion` and its contract-suite
  expectations cover the new behavior.

## Impact

- **Code**: `adapters/types.ts` (schema + contract), `adapters/runtime/adapter.ts` (sweep, scroller
  discovery), `adapters/runtime/validate.ts` (schema validation), `adapters/configs/chatgpt.json`
  (enable + `configVersion` bump), `content/index.ts` (once-per-install gate, ingest suspension),
  `core/folders/handlers.ts` + the title-index path (backfill stamping), `shared/types.ts`
  (durable backfill state).
- **Storage**: one additional durable per-platform flag recording that the backfill has run. No
  IndexedDB schema change if it lives on the existing `PlatformState` record; a migration otherwise.
- **Privacy**: unchanged. The sweep reads the host DOM the content script already reads and sends
  the same id/title pairs over the existing `conversation.ingest` op. No new network egress, no new
  permissions, no new host access — the sweep only scrolls a page the user is already on.
- **Performance**: the sweep is user-visible (it scrolls the host sidebar) and runs while the tab is
  foregrounded, because Chrome throttles hidden-tab timers to ≥1s and ~1/min after five minutes.
  Measured ~9s for 137 conversations; extrapolates to ~65s at 1000, which is why it needs hard
  round/time caps and must run once per install rather than per page load.
- **Risk**: a host switching its sidebar to windowed virtualization would break the append-only
  assumption. The existing `list-removed` guards (burst cap of 3, 700ms scroll grace) already
  suppress false prunes during scrolling, so the failure mode is an incomplete backfill, not data
  loss.
