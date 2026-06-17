## Context

The workspace UI talks to the single-writer service worker over the messaging hub
(`core/messaging`). MV3 terminates that worker after ~30s idle (Chrome lifecycle docs:
*"after 30 seconds of inactivity… receiving an event or calling an extension API resets
this timer"*; Chrome 110+ keeps it alive only while events are in flight). A message
revives a dormant worker, but delivery around revival is not guaranteed — the Chromium
tracker has long-standing reports of dropped messages (issue 40733525), and the docs do
not promise none are missed.

Today the only resilience is a read-only `queryWithRetry` living inside
`ui/sidebar/useWorkspace.ts`: a fixed 8×150ms loop that retries `no_response`/`send_failed`.
Mutations go through `mutateWorkspaceRemote` with no retry, and broadcast is best-effort
with no client-side reconciliation. The net effect (observed) is that a folder committed to
IndexedDB can show as "No folders yet" because the read raced the cold worker, or the
mutate's response/broadcast was missed and nothing re-read.

This change moves resilience down to the transport boundary so every consumer inherits it,
and pins the broadcast contract. It deliberately leaves UI behavior (load states,
reconcile-on-focus, observe-don't-replay) to the sibling `workspace-view-recovery` change.

## Goals / Non-Goals

**Goals:**
- A reusable, opt-in transient-retry seam in `core/messaging` for idempotent requests.
- A messaging spec that states broadcast is best-effort and consumers reconcile by re-query.
- The worker store handle recovers from a transient open failure instead of poisoning itself.
- Make the exhausted-budget failure code observable (diagnostic log).

**Non-Goals:**
- No UI changes (load/spinner/error states, focus/visibility recovery, observe-don't-replay
  mutate flow) — those are `workspace-view-recovery`.
- No keep-alive of the worker — fighting the MV3 lifecycle is an explicit anti-pattern.
- No worker-side "ready" re-broadcast on boot (considered; rejected for this change — it
  rides the same droppable delivery path and the client focus-recovery in the sibling
  change covers the case more simply).
- No schema/migration, manifest, or permission changes.

## Decisions

### Decision: Retry lives at the transport boundary, opt-in per call

Promote the retry loop from `useWorkspace` into `core/messaging/client.ts` as a
`sendWithRetry` (or `send(req, { retry })`) helper alongside `send`. `queryWorkspaceRemote`
opts in; `mutateWorkspaceRemote` does **not**.

- **Why:** every future consumer (prompts, profiles, comparisons) and the reconciling
  re-reads that `workspace-view-recovery` will add inherit one tested implementation.
- **Why opt-in, not automatic:** automatic retry of *every* send would replay a mutation
  whose response was lost — re-applying a committed write. Our ops aren't replay-idempotent
  (`folder.create`/`folder.move` recompute `order` over current siblings; every `put` bumps
  the sync `rev`). The Q1 decision is **observe-don't-replay**, so the transport must make
  "retry" a property of the *call*, not the channel. Reads retry; writes send once and the
  UI reconciles by re-reading.
- **Alternative considered:** keep `queryWithRetry` in the hook. Rejected — it can't be
  reused by the mutate-reconcile path or other features, and it conflates transport
  resilience with view logic.

### Decision: Transient = `no_response` | `send_failed` only

These two codes are exactly the "waking/dying worker" symptoms (`client.ts` maps a
`reply === undefined` to `no_response` and a thrown/rejected channel to `send_failed`).
Everything else (`unknown_kind`, `handler_error`, domain errors) is a real failure and is
returned immediately.

- **Why:** retrying a logic error just delays a guaranteed failure and can mask bugs.

### Decision: Budget and backoff — bounded attempts with a fixed delay

Keep the current shape (≈8 attempts, ≈150ms apart) as the default, exposed as parameters
for tests. A cold worker boot + first IndexedDB open generally completes well within ~1s;
the sibling change's focus/visibility recovery is the backstop for the rare boot that
overruns, so we do not need an unbounded or exponential loop here.

- **Open for tuning:** whether to widen to ~10 attempts or add light backoff; deferred to
  implementation + the diagnostic log's real-world codes.

### Decision: Don't poison the worker store handle

`core/store/instance.ts` caches `Promise<WorkspaceStore>` for the worker's life. A rejected
`openWorkspaceStore()` therefore makes every later read/write throw `handler_error` until
the worker restarts. Fix: on rejection, reset the cache so the next call re-opens. This is
an internal invariant (no observable contract), so it ships as **impl + regression test**
with no spec delta.

### Decision: Diagnostic log on budget exhaustion

When a retried send gives up, log the final error `code`. We could not fully disambiguate
the live failure mode (transient drop vs. `handler_error` from a poisoned handle) from the
screenshots; this makes the real code observable without changing behavior.

## Risks / Trade-offs

- **[Opt-in retry is a footgun if a future caller forgets it on a read]** → Centralize by
  having the *read* client (`queryWorkspaceRemote`) own the opt-in, so feature code calls a
  read helper that is already resilient; mutation helpers are the explicit single-attempt path.
- **[Fixed budget can still be too short for a very slow cold boot]** → Acceptable here
  because `workspace-view-recovery` adds focus/visibility re-reads as the backstop; this
  change is necessary but not solely sufficient, by design (documented dependency).
- **[Re-opening a failed store handle could loop on a permanently broken DB]** → The retry
  is driven by callers (next message), not an internal loop; a hard DB failure surfaces as
  repeated `handler_error`, which the diagnostic log captures rather than hiding.
- **[Spec MODIFIED on broadcast could read as new behavior]** → It is a clarification: the
  code already fans out to extension pages and swallows per-subscriber failures; the spec is
  being brought in line and given the explicit best-effort/reconcile contract.

## Open Questions

- Final retry budget/backoff numbers — settle during implementation using the diagnostic
  log's observed codes.
- Whether `workspace-store` should carry a one-line spec delta for store-handle open
  recovery, or keep it as a pure internal invariant (current lean: pure invariant + test).
