## 1. Prerequisite

- [x] 1.1 Confirm `messaging-resilience` is applied (resilient idempotent read helper + best-effort/reconcile broadcast contract available); this change consumes the shared read helper for the initial load and all reconciling re-reads.

## 2. Load-status state machine (useWorkspace)

- [x] 2.1 Add `status: 'loading' | 'ready' | 'error'` to `useWorkspace`, driven by the `folder.tree` read; set `ready` on success, `error` when the read fails after the transport retry budget, `loading` before the first read resolves.
- [x] 2.2 Keep counts/conversations failures non-fatal (degrade to defaults; do not flip the whole view to `error`).
- [x] 2.3 Expose `status` and a `retry()` (re-read) on the `WorkspaceView` returned by the hook.
- [x] 2.4 Coalesce refreshes: a single in-flight refresh, trailing calls collapse, to bound read storms from rapid triggers.

## 3. Observe-don't-replay mutate

- [x] 3.1 Change `mutate` to re-read worker state after every attempt (not only on `res.ok`); never re-send the mutation.
- [x] 3.2 Return enough signal for the caller to know whether the change took effect (e.g. `res.ok` plus the reconciled state), so the dialog can surface failure.

## 4. Sidebar rendering (Sidebar.tsx)

- [x] 4.1 Render the "No folders yet" empty state only when `status === 'ready'` and the active tree is empty.
- [x] 4.2 Show a loading indicator only if the first read has not resolved within the short delay threshold (no flash on warm reads).
- [x] 4.3 Render an `error` state with a "couldn't load" message and a retry action wired to `retry()`.
- [x] 4.4 Add the new user-facing strings (loading, couldn't-load, retry) to the existing `STR` map — token-styled, ARIA-labelled, keyboard-operable.

## 5. Dialog failure handling (Sidebar.tsx FolderDialog)

- [x] 5.1 Stop treating a mutation as success unconditionally; on a confirmed failure keep the entered values recoverable and show an inline error instead of closing and discarding input.

## 6. Side-panel reconcile triggers (SidePanelApp)

- [x] 6.1 Add `document.visibilitychange → visible` and `window.focus` listeners that trigger a workspace refresh; clean them up on unmount.
- [x] 6.2 Ensure these are guarded for the non-extension/test context (no throw without `document`/`window`).

## 7. Tests

- [x] 7.1 `useWorkspace`: status transitions — loading→ready (success), loading→error (exhausted retry), error→ready (retry succeeds).
- [x] 7.2 `useWorkspace`: observe-don't-replay — a mutation whose response fails but whose re-read shows the change renders it and the mutation is sent exactly once.
- [x] 7.3 `useWorkspace`: a mutation that fails and reconciles to no-change reports failure (no silent swallow).
- [x] 7.4 Sidebar: empty state hidden until a successful read; genuinely-empty shows it; failed read shows retry; warm read shows no spinner flash.
- [x] 7.5 Dialog: failed create keeps input and shows an error rather than closing silently.
- [x] 7.6 SidePanel: visibility-visible and focus each trigger a reconcile read.

## 8. Verify

- [x] 8.1 Run the extension test suite and typecheck; all green.
- [x] 8.2 Manual smoke reproducing the original bug: create a folder while the worker is cold; confirm it appears without remount; idle the worker with the panel open, then refocus and confirm the panel reconciles.
