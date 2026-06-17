## Why

Folders that are correctly persisted in IndexedDB show in the side panel as "No folders
yet" and do not recover until a manual remount. The view conflates three distinct states —
*loading*, *empty*, and *load-failed* — into one empty rendering, and it only ever re-reads
worker state after a successful mutation broadcast. When the MV3 worker is torn down at the
wrong moment (a documented, by-design lifecycle event), the read or the mutation
response/broadcast is missed and nothing re-queries, so the panel lies about the data.

`messaging-resilience` (prerequisite) makes a single read survive a waking worker and pins
the broadcast as best-effort + reconcilable. This change makes the **view** reconcile
correctly on top of that transport: it never shows "no folders" until a read has actually
succeeded, and it re-reads on the triggers that matter so a stale panel self-heals.

## What Changes

- **Observe-don't-replay after mutations.** `useWorkspace.mutate` SHALL re-read worker
  state after *every* mutation attempt (success or transient failure), not only on
  `res.ok`. The write already commits in the worker; the UI reconciles by re-reading rather
  than replaying the write. If the re-read shows the change did not take effect, the failure
  SHALL be surfaced to the user instead of silently swallowed.
- **Load states instead of a lying empty state.** The folder view SHALL track
  `loading | ready | error`. The "No folders yet" empty state SHALL render only after a read
  has succeeded; a loading indicator SHALL appear only if the first read has not resolved
  within a short delay (no flash on warm reads); a failed read SHALL show a "couldn't load /
  retry" affordance rather than the empty state.
- **Reconcile on focus/visibility regain.** The side panel SHALL re-read worker state when
  it becomes visible again (`document.visibilitychange → visible`) and on window focus, so a
  panel left open while its worker died converges on the truth the moment the user returns to
  it — without a remount.
- **Surface mutation failure (no silent data loss).** The create/edit dialog SHALL not
  treat a failed mutation as success; on a confirmed failure it keeps the user's input
  recoverable and signals the error, honoring the `[PRIV]` "never lose user input" guardrail.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `folders`: the single-writer/multi-tab requirement gains observe-don't-replay reconciliation
  and explicit load/error states; the sidebar empty state is gated on a successful read and a
  failed read shows a retry affordance instead of "No folders yet".
- `side-panel`: the panel re-reads (reconciles) worker state on visibility/focus regain, in
  addition to the existing broadcast-driven re-render.

## Impact

- **Depends on:** `messaging-resilience` (resilient idempotent read + best-effort/reconcile
  broadcast contract). This change consumes that read for both the initial load and the
  reconciling re-reads.
- **Code:** `extension/src/ui/sidebar/useWorkspace.ts` (load-status state machine,
  always-reconcile mutate, expose status), `extension/src/ui/sidebar/Sidebar.tsx`
  (loading/error/empty rendering + retry affordance, dialog failure handling),
  `extension/src/entrypoints/sidepanel/SidePanelApp.tsx` (visibility/focus reconcile hooks).
- **Strings/UI:** new user-facing strings (loading, "couldn't load", retry) — i18n-ready,
  token-styled, keyboard-operable, per the PREACT guardrail.
- **No manifest/permission changes; no schema/migration changes.**
