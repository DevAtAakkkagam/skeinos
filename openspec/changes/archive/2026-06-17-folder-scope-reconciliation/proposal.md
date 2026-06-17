## Why

PRD §6.1 promises folders are "independent per LLM platform **OR** unified across platforms (**user choice**)", but the shipped side panel delivers neither: the folder **tree** is unified (every folder shows on every platform tab), folder **counts** are global (all platforms), yet folder **contents** are filtered to the active tab's platform — and the `platformScope` field is written at folder-create but never read. The visible symptom is a folder badge reading "5" above a body that says "Nothing here yet" on a tab whose platform holds none of those five. The "unified" experience the shared tree implies is unreachable, and the user-choice toggle does not exist. This change makes the workspace coherently **unified by default with an optional platform view-filter**, reconciling PRD §6.1 with D25/D27.

## What Changes

- **BREAKING (read contract):** the `conversation.list` workspace selector no longer hard-filters to a single platform. The folder browser reads the **unified** conversation set (all platforms) so a folder shows every conversation assigned to it regardless of where it was created.
- Add a **platform view-filter** to the workspace UI — a chip group (sibling to the existing `sk-tags` "All / + tag" row) that narrows the unified list to one platform. **Default is "All" (unified)**, per the chosen direction.
- Make **folder counts coherent with visible contents**: the badge equals the number of conversations shown under the active filter (global when "All"; that platform's count when filtered) — derived from the single unified list so the global-vs-scoped mismatch cannot recur.
- Keep the **active-conversation card per-platform/per-tab** (the D27 active seam) — it legitimately reflects "what I'm reading in *this* tab" and is unchanged. Only the *folder/library browser* becomes unified.
- Stop stamping new folders with the creating tab's platform: folders are created `platformScope: 'unified'`. The field is retained in the schema for the deferred M4 structural independent-mode (T4.3) but no longer drives the browser. **No data migration** — `folder.tree` never filtered on it, so existing folders already render unified.
- Record the reconciliation as a new decision (**D28**) in `docs/DECISIONS.md` and amend the `side-panel` / `folders` spec requirements that asserted blanket platform-scoping.

**Explicit non-goals:** the M4 *structural* unified⇄independent per-folder toggle (T4.3) is **not** built here — the platform filter is a view filter, not folder scoping. Tags (C7) and the search platform-filter (D26) are untouched. Host gating / neutral-state behavior is unchanged.

## Capabilities

### New Capabilities
<!-- None. This reconciles existing behavior; no new capability is introduced. -->

### Modified Capabilities
- `folders`: folder contents are unified across platforms (a folder shows all assigned conversations regardless of platform); folder counts equal the visible contents under the active platform filter; the `conversation.list` read returns the unified set and folders are created with `platformScope: 'unified'`.
- `side-panel`: the "panel scopes all workspace data to the active tab's platform" requirement is narrowed — only the **active-conversation context** and host gating derive from the active tab; the **folder/workspace browser is unified** with an optional platform view-filter.
- `sidebar-shell`: add a platform view-filter control (chip group) that defaults to "All" (unified) and narrows the rendered conversation list to a single platform.

## Impact

- **Read contract:** `WorkspaceSelector`'s `conversation.list` (`shared/workspace.ts`) drops the required `platform` field (becomes unscoped / unified); `conversation.active` keeps `platform`. Handler in `core/folders/handlers.ts` returns the unified set.
- **UI:** `ui/sidebar/useWorkspace.ts` (unified read + filter state), `ui/sidebar/Sidebar.tsx` (folder contents + count derivation under the filter; folder-create `platformScope` → `'unified'` at line ~594), `ui/sidebar/SidebarShell.tsx` (platform-filter chip row), `ui/sidebar/ConversationList.tsx` (unchanged — receives the already-filtered rows).
- **Counts:** folder counts derived client-side from the unified list under the active filter; the separate `folder.counts` global query may be retired (design decides).
- **Docs/specs:** new `docs/DECISIONS.md` D28; delta specs for `folders`, `side-panel`, `sidebar-shell`.
- **No change** to: the active-conversation seam semantics (D27), conversation ingest, the store schema (the `platformScope` field stays; no migration), permissions/host gating, or any adapter.
