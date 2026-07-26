## Context

`listConversations()` is a pure DOM read (`adapters/runtime/adapter.ts`): it maps whatever
`conversationItem` elements the host has rendered. Hosts that paginate their sidebar therefore hide
most of a user's history from Skeinos.

A live probe on 2026-07-26 measured all four platforms against their shipped configs, using the
`ui-validate` CDP-attach technique (plain Chrome on the MCP profile, human logs in, script attaches
over the debug port). Findings that this design rests on:

| Platform | Sidebar rows | Real scroller | Scroll loads more? | Full history |
|---|---|---|---|---|
| chatgpt | 55 → **137** | `nav.group/scrollport` (**ancestor** of `#history`) | **yes** | in the sidebar |
| claude | **20** (hard cap) | `div.dframe-nav-scroll` (**descendant**) | no | 43 at `/recents` |
| gemini | 17 | `<infinite-scroller>` (ancestor+6) | no | already complete |
| perplexity | 9 | `div.size-full` (descendant) | no | already complete |

Load trace for ChatGPT, one round = `scrollTop := scrollHeight` then wait 900ms:

```
55@2640 → 57@2840 → 83@3648 → 85@3848 → 111@4656 → 113@4856 → 137@5592 → 137 → 137 → 137
          └─ +2 ─┘ └─ +26 ─┘  └─ +2 ─┘  └─ +26 ─┘  └─ +2 ─┘  └─ +24 ─┘  └── plateau ──┘
```

~28 rows per page, ~2 rounds per page, and a clean plateau in both row count and `scrollHeight`.
Critically, `distinctEverSeen == finalCount == 137`: **nothing is recycled**. A later probe run,
minutes afterwards, still found all 137 rows in the DOM.

Three existing invariants make the backfill cheap and safe:

1. `conversation.ingest` is **additive** — `indexConversationTitle` upserts and is content-hash
   gated (`core/folders/handlers.ts`). Ingesting the same rows repeatedly writes nothing.
2. Nothing prunes on a shrinking list except `list-removed`, which is guarded by a 3-id burst cap
   and a 700ms scroll grace (`adapters/runtime/adapter.ts`). The sweep's own scrolling keeps
   `lastScrollAt` fresh, so the grace suppresses false prunes for free.
3. `PlatformState` already exists as durable, local-only, per-platform state that survives MV3
   worker death — a natural home for the "backfill has run" flag.

## Goals / Non-Goals

**Goals:**

- Index a user's complete ChatGPT history without requiring them to manually scroll their sidebar.
- Do it once per install per platform, not on every page load.
- Keep the mechanism config-driven and generic, so it is not ChatGPT-specific code.
- Never reorder the user's existing side-panel list as a side effect.
- Add no new permissions, no new network egress, and no new selectors that can break.

**Non-Goals:**

- `route` mode (loading Claude's `/recents` in a background tab). The evidence for it is solid but
  it is a different feature — different selectors, tab navigation, and its own privacy surface.
  This change only reserves the enum slot.
- Gemini and Perplexity. Their sidebars were measured as already complete; there is no gap.
- Keeping the host sidebar fully loaded on an ongoing basis. Append-only + additive ingest means one
  sweep is permanent.
- A progress UI. The sweep is silent by decision; only durable state records that it ran.

## Decisions

### D1 — Runtime scroller discovery, not a config selector

Walk from the configured `conversationList` element in **both** directions — self, then ancestors
(bounded, ~12 levels), then descendants — keeping any element whose computed `overflow-y` is
`auto|scroll` and whose `scrollHeight - clientHeight > 4`. Pick the candidate with the largest
overflow. Fall back to `document.scrollingElement`.

*Why:* the probe's first pass walked only ancestors and produced two false "no scroller" readings
(Claude, Perplexity), which would have been read as "these platforms don't paginate" — the right
conclusion by luck, for the wrong reason. The bidirectional walk found the correct element on all
four. A config selector would also mean shipping `nav.group\/scrollport` — a Tailwind class
containing a `/` that needs CSS escaping, exactly the kind of string that churns. Runtime discovery
is one less selector in the hot-fix surface.

*Alternative considered:* a `listScrollContainer` selector in the config. Rejected — more brittle,
more to hot-fix, and buys nothing the walk doesn't already get right.

### D2 — Stop conditions: plateau in both count and height, plus hard caps

A round is `scrollTop := scrollHeight`, wait `settleMs`, re-measure. Stop when **neither** the row
count **nor** `scrollHeight` has grown for `stableRounds` consecutive rounds, or when a hard round
cap or wall-clock cap is hit.

*Why both signals:* the trace shows +2-row rounds interleaved with +26-row rounds — the host renders
placeholder rows before the real page lands. Counting rows alone risks an early stop on a
placeholder round; `scrollHeight` grows on both. Requiring both to plateau also survives a host that
renders fixed-height skeletons.

*Why hard caps:* at ~28 rows per page and ~2 rounds per page, a 1000-conversation account needs ~72
rounds ≈ 65s. The caps bound the worst case and make the sweep abandonable rather than unbounded.
Hitting a cap is a partial success — additive ingest means the rows already loaded are kept, and the
gate (D4) records the attempt.

### D3 — Suspend ingest during the sweep, ingest once at the end

*Why:* the settle interval (900ms) exceeds `INGEST_DEBOUNCE_MS` (500ms), so `list-changed` would
otherwise fire partial ingests throughout the sweep. Because stamping is first-write-wins under the
hash gate, a row first seen mid-sweep would keep a stamp computed against a half-loaded list, and
the final full ingest could not correct it. Suspending and firing one ingest at the end makes DOM
position meaningful.

### D4 — Once per install per platform, on durable state

Record completion on the existing `PlatformState` record (extended with a nullable
`historyBackfilledAt`), written by the service worker as the single writer. The content script asks
the worker before sweeping and reports afterwards.

*Why not per page load:* the sweep is visible and costs up to a minute. Append-only + additive
ingest means repeating it buys nothing.

*Why not in-memory:* MV3 kills the worker after ~30s idle (`[SW]` guardrail); an in-memory flag
would re-trigger the sweep on every worker wake.

*Why `PlatformState` rather than a new store:* it is already per-platform, local-only, never synced,
and worker-death-durable — the exact shape needed, and it avoids an IndexedDB migration.

### D5 — Backfilled rows stamp below the existing floor

Today `conversation.ingest` stamps `updatedAt = Date.now() - position` to preserve the host's
newest-first DOM order. Applied to a backfill this inverts the list: a two-year-old conversation
discovered at position 400 would stamp `now - 400ms` — newer than every record ingested in any
previous session.

For an ingest flagged as a backfill, newly-discovered records instead stamp relative to a floor:

```
floor = min(updatedAt) over this platform's existing records
newly discovered at DOM position p (p ≥ firstNewPosition):
    updatedAt = floor - 1 - (p - firstNewPosition)
```

Already-known records are untouched (the hash gate already no-ops them). The backlog therefore sorts
strictly below everything the user had already seen, preserving relative order within the backlog.

*Alternative considered:* a dedicated `firstSeenOrder` field, so list order stops riding on
`updatedAt`. Cleaner long-term and probably right eventually, but it touches the `Repo` schema and
needs a migration — disproportionate for this change. Noted as future work.

### D6 — Sweep runs foregrounded

Chrome throttles `setTimeout` in hidden tabs to ≥1s, and to roughly once a minute after five
minutes of backgrounding. A hidden-tab sweep would stall for tens of minutes, so the sweep runs on
the ready path of a visible tab and the user sees their sidebar scroll. Original `scrollTop` is
restored when the sweep ends, including on the abandon path.

## Risks / Trade-offs

- **A host switches to windowed virtualization** → the append-only assumption breaks and the sweep
  captures a moving window. Mitigation: rows are ingested from the final DOM state, and the existing
  `list-removed` guards (3-id burst cap, 700ms scroll grace, refreshed by the sweep's own scrolling)
  already prevent recycled rows from being pruned. Failure mode is an incomplete backfill, never
  data loss. The sweep also reports whether distinct-ids-seen exceeded final row count, which is a
  direct virtualization signal a later change can act on.
- **User is scrolling their sidebar while the sweep runs** → the sweep fights them for up to a
  minute. Mitigation: hard caps bound it; scroll position is restored; it happens once per install.
- **Sweep never plateaus** (host bug, infinite skeleton) → bounded by the round and wall-clock caps.
- **Cap hit before the end on a very large account** → partial backfill, silently. Mitigation:
  record the outcome (completed vs. capped) in durable state so a later change can resume rather
  than re-sweep from scratch. Accepted for this change: partial is strictly better than the 55/137
  status quo.
- **Visible scrolling reads as a bug to the user** → accepted trade-off of the silent-sweep
  decision. It is once per install, and the alternative (a user-triggered button) was considered and
  set aside in favour of zero-configuration completeness.
- **`historyExpansion` enum ships with one member** → mild over-engineering. Justified: the probe
  confirmed `route` is a real, needed second mode for Claude, and adding it later without the enum
  would mean a config schema migration across a hot-fixable, remotely-served config surface.

## Migration Plan

No data migration if `historyBackfilledAt` lands on `PlatformState` (a nullable field on a
local-only record that is rebuilt from live tabs anyway). Existing installs simply have no flag set
and sweep once on their next ChatGPT visit — which is the desired behavior, since their index is
exactly the truncated one this change fixes.

Rollback is a config change, not a code change: shipping a ChatGPT config with `historyExpansion`
removed disables the sweep on every install via the existing hot-fix channel, without a store
release.

## Open Questions

- Should a capped (incomplete) sweep be resumable on a later visit, or is one attempt per install
  enough? Recording the outcome is in scope; acting on it is not.
- Does `/recents`-style `route` mode belong to this capability or a new one? Deferred with the mode.
- Is 43 Claude / 17 Gemini / 9 Perplexity representative, or do those hosts also cap on much larger
  accounts? Confirmed as the account's real totals for this user; unverified at other scales.
