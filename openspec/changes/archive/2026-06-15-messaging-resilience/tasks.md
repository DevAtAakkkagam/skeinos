## 1. Transport retry seam (core/messaging)

- [x] 1.1 Add an opt-in transient-retry helper to `core/messaging/client.ts` (e.g. `sendWithRetry(req, { tries, delayMs })` or `send(req, { retry })`) that retries only `no_response`/`send_failed`, bounded with a delay, resolving with the first success or the last error.
- [x] 1.2 Define the transient-error set in one place (`no_response`, `send_failed`) and ensure logic/domain errors (`unknown_kind`, `handler_error`, validation) are returned on the first attempt with no retry.
- [x] 1.3 On budget exhaustion, record the final error `code` (diagnostic log) without changing the returned envelope.
- [x] 1.4 Export the helper from `core/messaging` so feature clients consume it.

## 2. Wire the read path through the seam

- [x] 2.1 Route `queryWorkspaceRemote` (`core/folders/client.ts`) through the retry helper (reads are idempotent → opt in).
- [x] 2.2 Leave `mutateWorkspaceRemote` as a single-attempt `send` (observe-don't-replay; no write replay).
- [x] 2.3 Remove the local `queryWithRetry` from `ui/sidebar/useWorkspace.ts` and call the shared read helper instead (no behavior change for the hook beyond the shared implementation).

## 3. Worker store-handle recovery (core/store)

- [x] 3.1 In `core/store/instance.ts`, reset the cached handle when `openWorkspaceStore()` rejects, so the next `workspaceStore()` call re-opens instead of returning the cached rejection.
- [x] 3.2 Keep a successful open cached as today (single open per worker generation).

## 4. Broadcast contract alignment (already-implemented behavior)

- [x] 4.1 Confirm `broadcast` in `core/messaging/hub.ts` fans out to host tabs AND extension pages and swallows per-subscriber failures (matches the MODIFIED spec); adjust only if it diverges.

## 5. Tests

- [x] 5.1 Migrate/extend `tests/useworkspace-retry.test.ts` (or a new `messaging-retry` test) to cover the shared helper: transient retried→ok, non-retryable single attempt, logic error not retried, budget exhausted returns last error.
- [x] 5.2 Assert the diagnostic `code` is logged on budget exhaustion.
- [x] 5.3 Add a `core/store/instance.ts` regression test: a rejected first open does not poison subsequent calls (next call re-opens and succeeds).
- [x] 5.4 Extend `tests/messaging.test.ts` broadcast coverage for the best-effort/reconcile scenarios (extension-page delivery, swallowed failure) if not already covered.

## 6. Verify

- [x] 6.1 Run the extension test suite and typecheck; all green.
- [x] 6.2 Manual smoke: with the worker idle-killed, the side panel's read recovers within the retry budget (folder appears without a remount); confirm the diagnostic log only fires when the budget is truly exhausted.
