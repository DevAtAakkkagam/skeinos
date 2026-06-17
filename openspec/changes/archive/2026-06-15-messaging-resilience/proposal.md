## Why

MV3 terminates the service worker after ~30s idle (by design — confirmed by Chrome's
lifecycle docs), and a round-trip to a dormant or just-reviving worker can be dropped.
Today the side panel's first read on a cold open can fail transiently with no recovery,
and the broadcast that should re-sync open pages is best-effort but the client has no
"next query" to reconcile from. The result is observable data loss in the UI: folders
that are correctly persisted in IndexedDB show as "No folders yet" until a manual remount.

This change hardens the **transport layer only** so every consumer (folders today;
prompts, profiles, comparisons later) inherits a worker round-trip that survives the
documented MV3 lifecycle. The UI-side recovery (load states, reconcile-on-focus,
observe-don't-replay) is a sibling change (`workspace-view-recovery`) that depends on this.

## What Changes

- **Transparent transient retry on the client.** The messaging client SHALL retry a
  request that fails with a *transient transport* error (`no_response`, `send_failed`) —
  symptoms of a waking/dying worker — with a bounded number of attempts and backoff,
  resolving with the first success or the last error. Logic errors (`unknown_kind`,
  `handler_error`, domain errors) are NOT retried. This generalizes the read-only
  `queryWithRetry` (currently buried in `useWorkspace`) into a shared transport helper
  used for every `send`.
- **Broadcast delivery is contractually best-effort + reconcilable.** The spec makes
  explicit that `Broadcast` delivery is not guaranteed (a worker can be torn down before
  fan-out, a page can miss a message) and that durable truth lives in the store, so
  consumers MUST be able to reconcile current state by re-querying. This licenses the
  recovery behavior in the sibling UI change and stops treating a missed broadcast as a
  silent failure.
- **Worker store handle recovers from a failed open (impl, no spec change).** A rejected
  `openWorkspaceStore()` SHALL NOT be cached for the worker's lifetime; the next call
  re-opens. Backed by a regression test. (Internal invariant, not an observable contract.)
- **Diagnostic.** Log the error `code` when the transient-retry budget is exhausted, so
  the real failure mode is observable rather than assumed.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `messaging`: add a requirement that the client transparently retries transient transport
  failures from a waking worker (bounded, backoff, logic errors excluded); clarify the
  existing broadcast requirement to state delivery is best-effort and consumers reconcile
  by re-query.

## Impact

- **Code:** `extension/src/core/messaging/client.ts` (new `sendWithRetry` / retry seam),
  `extension/src/core/folders/client.ts` (route reads through the shared retry),
  `extension/src/ui/sidebar/useWorkspace.ts` (drop the local `queryWithRetry`, consume the
  shared helper), `extension/src/core/store/instance.ts` (don't cache a rejected open).
- **Tests:** existing `useworkspace-retry.test.ts` migrates to cover the shared helper;
  new coverage for store-handle open-failure recovery and budget-exhaustion logging.
- **Dependents:** `workspace-view-recovery` (sibling change) builds on the
  best-effort-broadcast clarification and the resilient read path.
- **No manifest/permission changes; no schema/migration changes.**
