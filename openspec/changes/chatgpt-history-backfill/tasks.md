## 1. Config schema and contract

- [x] 1.1 Add `HistoryExpansionMode` (`'scroll'`, the only implemented member) and a
      `HistoryExpansion` interface (`mode` plus optional positive-number tuning fields: settle
      interval, stable rounds, round cap, wall-clock cap) to `adapters/types.ts`; add optional
      `historyExpansion` to `AdapterBehaviors` with a comment explaining that `route` is reserved
      for Claude's `/recents` and deliberately unimplemented.
- [x] 1.2 Add `expandHistory(opts?): Promise<HistoryExpansionSummary>` to the `PlatformAdapter`
      interface, with `HistoryExpansionSummary` carrying `startCount`, `finalCount`,
      `distinctSeen`, `rounds`, and `stoppedBy: 'plateau' | 'cap' | 'noop'`.
- [x] 1.3 Extend `adapters/runtime/validate.ts` to validate `historyExpansion`: reject a `mode`
      outside the enum and any tuning field that is not a positive number; accept its absence.
- [x] 1.4 Unit-test validation — valid `historyExpansion` accepted, omitted accepted, bad `mode`
      and non-positive tuning fields rejected with errors and no adapter built.

## 2. Runtime scroller discovery

- [x] 2.1 Implement `findScroller(listEl)` in `adapters/runtime/`: consider the list element, its
      ancestors to a bounded depth, and its descendants; keep candidates whose computed
      `overflow-y` is `auto`/`scroll` and whose `scrollHeight - clientHeight > 4`; return the
      largest-overflow candidate, else `document.scrollingElement`, else null.
- [x] 2.2 Unit-test discovery against fixtures placing the scroller as the list itself, as an
      ancestor (the ChatGPT shape), as a descendant (the Claude shape), and absent entirely.
- [x] 2.3 Unit-test that the largest-overflow candidate wins when several qualify.

## 3. The sweep

- [x] 3.1 Implement `expandHistory` in `adapters/runtime/adapter.ts`: no-op when the config declares
      no `historyExpansion`; otherwise discover the scroller, record `originalScrollTop`, and loop
      rounds of `scrollTop := scrollHeight` + settle wait + re-measure.
- [x] 3.2 Implement the stop conditions: plateau only when NEITHER item count NOR `scrollHeight`
      grew for the configured consecutive rounds; plus a hard round cap and a hard wall-clock cap.
- [x] 3.3 Restore `originalScrollTop` on every exit path (plateau, cap, no scroller, thrown error)
      and ensure the sweep never rejects — a missing list or DOM error resolves as a no-op summary.
- [x] 3.4 Track distinct item ids across rounds and report them in the summary (the
      append-only/virtualization signal).
- [x] 3.5 Unit-test the sweep against a paginating fake list: loads to completion, reports
      `plateau`; a placeholder round that grows only `scrollHeight` does not stop it early; an
      ever-growing list stops at a cap and reports `cap`; scroll position is restored in all cases;
      a config without `historyExpansion` runs zero rounds.

## 4. Durable once-per-install state

- [x] 4.1 Add a nullable `historyBackfilledAt` (and the recorded `stoppedBy` outcome) to
      `PlatformState` in `shared/types.ts`; confirm no IndexedDB migration is needed, and add one
      if the record turns out to be persisted under a versioned schema.
- [x] 4.2 Add the worker-side op to read and record backfill state in `core/folders/handlers.ts`,
      keeping the service worker as the single writer, and expose it through the messaging client.
- [x] 4.3 Unit-test that the recorded state round-trips and is readable after a simulated worker
      restart.

## 5. Content-script orchestration

- [x] 5.1 In `content/index.ts`, on the `full` activation path: if the config declares
      `historyExpansion` and no backfill is recorded for this platform, suspend list ingest, run
      `expandHistory()`, then record the outcome.
- [x] 5.2 Implement ingest suspension so `list-changed` fires no `conversation.ingest` while the
      sweep is in progress, and fire exactly one backfill-flagged ingest when it ends.
- [x] 5.3 Ensure the sweep is skipped entirely when a backfill is already recorded, and that it
      never runs on the `compose` (signed-out) path.
- [x] 5.4 Keep the whole sweep best-effort: a failure logs a warning and leaves normal ingest
      working.
- [x] 5.5 Test that a first activation sweeps and records, a second activation does not sweep, and
      that no ingest is sent mid-sweep while exactly one is sent afterwards.

## 6. Backfill-aware recency stamping

- [x] 6.1 Add a `backfill` flag to the `conversation.ingest` op in `shared/workspace.ts`.
- [x] 6.2 In `core/folders/handlers.ts`, when the flag is set: compute `floor` as the minimum
      `updatedAt` across the platform's existing records, and stamp newly-discovered records at
      `floor - 1 - (position - firstNewPosition)`; leave existing records untouched (the hash gate
      already no-ops them). Leave non-backfill ingest behavior exactly as it is.
- [x] 6.3 Handle the empty-index case (no existing records ⇒ stamp in host-list order with no
      inversion).
- [x] 6.4 Unit-test: backfilled records sort strictly below all pre-existing ones; pre-existing
      `updatedAt` values are unchanged; backlog keeps its relative order; empty-index backfill is
      ordered correctly; a non-backfill ingest is byte-for-byte unchanged in behavior.

## 7. ChatGPT config and fixtures

- [x] 7.1 Add `"historyExpansion": { "mode": "scroll" }` to
      `adapters/configs/chatgpt.json` and bump its `configVersion`.
- [x] 7.2 Add a paginating ChatGPT fixture that renders an initial page and appends further pages
      as its scroll container is driven to the end, without removing prior rows.
- [x] 7.3 Extend the ChatGPT contract coverage: `expandHistory()` loads every page and completes by
      plateau; `listConversations()` then returns the fixture's full set with correct `nativeId`s
      and titles; distinct ids seen equals the final row count.
- [x] 7.4 Confirm the existing ChatGPT fixture and `.expected.json` still pass unchanged.

## 8. Verification

- [x] 8.1 `npm run typecheck && npm test && npm run lint` green.
- [x] 8.2 `npm run test:browser` green — the sweep touches real scroll/layout behavior, so the
      real-Chromium suite is the meaningful check for scroller discovery.
- [x] 8.3 `npm run check:size` — confirm the sweep does not push the content bundle past its budget.
- [ ] 8.4 Manual round on live chatgpt.com via the `ui-validate` CDP technique: a fresh profile
      indexes the full history on first visit, the second visit does not re-sweep, scroll position
      is restored, and the side-panel order is not inverted by the backfill.
