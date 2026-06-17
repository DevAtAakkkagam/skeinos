## Context

The side panel is a pure view over single-writer state: `useWorkspace` reads the folder
tree/counts/conversations from the worker and re-reads on `state.changed` broadcasts. Two
gaps make persisted data invisible:

1. The hook's initial state is `EMPTY_TREE`, and a failed read leaves it untouched — so
   "load failed" and "genuinely empty" both render as "No folders yet" (`Sidebar.tsx`).
2. The only re-read triggers are a successful-mutation path (`if (res.ok) refresh()`) and a
   `state.changed` broadcast. When the MV3 worker is torn down at the wrong moment, the
   mutation response and the broadcast can both be missed, and there is no other trigger —
   the panel stays stale until a remount.

`messaging-resilience` (prerequisite) makes a single read survive a waking worker and
declares broadcast best-effort + reconcilable. This change builds the view behavior that
*uses* that: reconcile by re-reading on the right triggers, and never lie about the data.

## Goals / Non-Goals

**Goals:**
- A `loading | ready | error` status in `useWorkspace`, surfaced to the sidebar.
- Gate the "No folders yet" empty state on a successful read; delayed spinner; error+retry.
- Observe-don't-replay: re-read after every mutation attempt; never re-send the write.
- Reconcile on `visibilitychange → visible` and window focus.
- Surface mutation failure so user input is never silently lost (`[PRIV]`).

**Non-Goals:**
- Transport-level retry, broadcast contract, store-handle recovery — owned by
  `messaging-resilience`.
- Optimistic UI for mutations (render the change before the worker confirms). Out of scope;
  observe-don't-replay reconciles from the worker, which is simpler and correct for now.
- Worker-side "ready" re-broadcast on boot (rejected in the sibling change's design).

## Decisions

### Decision: A small load-status state machine in `useWorkspace`

Track `status: 'loading' | 'ready' | 'error'` alongside the existing `tree`/`counts`/
`conversations`. A successful `folder.tree` read sets `ready`; an exhausted-retry failure
sets `error`; the pre-first-read state is `loading`. The empty state is
`status === 'ready' && tree.active.length === 0`.

- **Why:** the bug is fundamentally a missing distinction between three states collapsed
  into one. The status is the minimal honest model.
- **Granularity:** status is driven by the `folder.tree` read (the one that decides
  empty-vs-not). Counts/conversations failing independently degrade gracefully (counts
  default to 0) and do not flip the whole view to `error`.
- **Alternative considered:** infer "loaded" from a sentinel tree value. Rejected — implicit
  and fragile; an explicit status is testable.

### Decision: Delayed loading indicator (no warm-read flash)

Show the spinner only if the first read has not resolved within a short delay (≈150ms,
matching the transport's retry cadence). A warm read resolves first and renders the tree/
empty state directly.

- **Why:** a spinner that flashes on every warm open is its own UX bug. The delay hides the
  common fast path while still covering a slow cold boot.
- **Open:** exact threshold — tune with the diagnostic data from `messaging-resilience`.

### Decision: Observe-don't-replay in `mutate`

Change `if (res.ok) refresh()` to **always** `refresh()` after the attempt (a `finally`-style
reconcile), and use the result to decide whether to surface failure: if `res.ok` is false
*and* the reconciling read shows no change, signal failure to the caller (the dialog). Never
re-send the mutation.

- **Why:** the worker often commits the write even when the response/broadcast is lost
  (observed: the row is in IndexedDB while the panel shows empty). Re-reading reveals the
  truth; replaying risks double-apply (`rev` bump, `order` drift) because the ops are not
  replay-idempotent. This is the Q1 decision, realized in the view.
- **Reconcile read resilience:** the re-read uses the resilient read helper from
  `messaging-resilience`, so it survives the worker restart that a freshly-committed mutation
  may have triggered.

### Decision: Reconcile on visibility + focus in the side-panel entry

Add `document.visibilitychange → visible` and `window.focus` listeners in `SidePanelApp`
(or a thin hook it owns) that call the workspace `refresh()`. These cover "panel left open
while the worker died, user returns to it."

- **Why here, not in `useWorkspace`:** the panel page owns its document/window lifecycle;
  the hook owns data. The panel triggers a refresh; the hook performs it.
- **Coverage split (explicit):** visibility/focus covers *came back to a stale panel*;
  always-reconcile-after-mutate covers *stayed focused, worker idled, then mutated* — where
  no visibility change fires. Both are needed; neither alone is sufficient.

### Decision: Surface mutation failure in the create/edit dialog

The dialog's `onSubmit` currently closes unconditionally and discards the `mutate` result.
On a confirmed failure it SHALL keep the entered values recoverable and show an error,
honoring `[PRIV]` "never lose user input."

- **Open:** keep the dialog open with an inline error vs. close + show a toast with undo of
  the lost input. Lean: keep the dialog open with an inline error (simplest, no toast system
  yet).

## Risks / Trade-offs

- **[A reconcile read storm if visibility/focus fire rapidly]** → Debounce/coalesce
  refreshes (a single in-flight refresh; trailing call collapses). Cheap and standard.
- **[`error` state could stick if retry also fails]** → The retry action and the
  visibility/focus triggers both re-attempt; `error` is never terminal.
- **[Always-reconcile after mutate doubles reads on the happy path]** (mutate refresh +
  broadcast refresh) → Already true today; the coalescing above bounds it to one read.
- **[Depends on `messaging-resilience` landing first]** → Sequence the changes; if this
  lands first, the reconcile reads would use the un-hardened single-attempt read and could
  still race a cold worker. Enforced by the documented dependency.

## Open Questions

- Loading-delay threshold and whether to coalesce all three selectors' loads into one status.
- Dialog failure UX: inline error (keep open) vs. toast-with-recovery — pending whether a
  toast primitive exists yet.
- Whether window `focus` is redundant with `visibilitychange` for the side panel in practice
  (some Chromium versions fire only one) — keep both for safety unless testing shows dup.
