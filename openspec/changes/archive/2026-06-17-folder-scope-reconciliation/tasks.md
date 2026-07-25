## 1. Read contract (worker side)

- [x] 1.1 In `extension/src/shared/workspace.ts`, drop the required `platform` field from the `conversation.list` selector so it reads the unified set (`{ kind: 'conversation.list' }`); leave `conversation.active` keyed by `platform`. Update the `WorkspaceSnapshot` doc comment if needed.
- [x] 1.2 In `extension/src/core/folders/handlers.ts`, change the `conversation.list` case to return all conversations (`store.conversations.query()`), removing the `c.platform === selector.platform` filter.
- [x] 1.3 Decide `folder.counts` per design D-FSR2: grep for consumers; if the only consumer is the panel, remove the `folder.counts` selector + handler case (counts derived client-side). If kept, leave dormant and note why. Record the choice in the task notes. **Decision: RETIRED.** Grep confirmed the sole consumer was the panel (`useWorkspace.ts`); the selector + snapshot variant + handler case are removed and counts are derived client-side via `countByFolder` (which stays unit-tested in `folders-tree.test.ts`).

## 2. UI — unified browser + platform filter

- [x] 2.1 In `extension/src/ui/sidebar/useWorkspace.ts`, call `conversation.list` without `platform` (unified); keep `conversation.active` per-platform. If `folder.counts` was removed, stop reading it and expose the unified `conversations` for client-side derivation; otherwise keep `counts` as-is.
- [x] 2.2 Add panel-local platform-filter view state (default `'all'`), exposed to the shell + folder rendering. It is ephemeral (not persisted) and never mutates folders or `platformScope`.
- [x] 2.3 In `extension/src/ui/sidebar/Sidebar.tsx`, apply the platform filter when scoping folder/unfiled contents (`conversations.filter(...)`), and derive each folder's badge from the filtered set so the badge equals the rendered rows (replaces `counts[f.id]` if `folder.counts` was removed). Confirm the active-row highlight still matches `conversationId(active.platform, active.nativeId)`.
- [x] 2.4 Change folder creation in `Sidebar.tsx` (~line 594) to pass `platformScope: 'unified'` instead of the active `platform`.

## 3. UI — filter control in the shell

- [x] 3.1 In `extension/src/ui/sidebar/SidebarShell.tsx`, add the platform view-filter chip group beside the existing `sk-tags` row: an active-by-default "All" chip plus a chip per platform present in the workspace; token-styled, keyboard-operable, with an accessible group label. Wire selection to the filter state from 2.2.

## 4. Docs & specs reconciliation

- [x] 4.1 Add decision **D28** to `docs/DECISIONS.md` reconciling with D25/D27: workspace folder browsing is unified by default with an optional platform view-filter; only the active-conversation context and host gating derive from the active tab; the structural unified⇄independent per-folder toggle stays deferred to M4 (T4.3); `Folder.platformScope` is retained but no longer drives the browser.
- [x] 4.2 Spot-check that no other doc (`docs/LLD`, `CLAUDE.md`) asserts blanket platform-scoping of the folder browser in a way D28 now contradicts; note any follow-up rather than silently editing. **Result: no contradiction found.** `CLAUDE.md` already frames the product as "unified organization"; `docs/LLD` §216 only declares the `platformScope` field and §433 (T4.3) already frames the unified⇄per-platform toggle as deferred M4 work — both consistent with D28. No follow-up edits needed.
- [x] 4.3 Fix the stale non-normative prose in `openspec/specs/side-panel/spec.md` intro (~lines 7-8, "scopes its data to the active tab's platform") at archive time — the requirement-level delta updates the requirement block but not the capability intro paragraph; reword it to match D28 (active-conversation context + host gating scope to the active tab; folder browser is unified).

## 5. Tests

- [x] 5.1 Update/extend the `conversation.list` handler test for the unified return (no platform filter); if `folder.counts` was removed, migrate/retire its test.
- [x] 5.2 Add a `useWorkspace` / Sidebar test: a folder holding conversations from two platforms renders all of them under "All", and the badge equals the rendered rows (the "5 vs empty" regression guard).
- [x] 5.3 Add a filter test: selecting a platform narrows folder/unfiled contents and the badge to that platform; "All" restores the unified view.
- [x] 5.4 Add a `SidebarShell` test: the platform chip group defaults to "All", is keyboard-operable, and exposes the group label.
- [x] 5.5 Add an active-highlight test: the active-conversation row stays highlighted within the unified list (and under a matching platform filter).

## 6. Verify

- [x] 6.1 Run `npm run typecheck` and the affected unit suites — green. (typecheck clean; `folders-handlers`, `useworkspace-recovery`, `sidebar`, `sidebar-shell` → 47 passed. `npm run lint` also clean.)
- [x] 6.2 Run `npm test` to confirm no regression across the folders/side-panel/sidebar-shell suites. (Full suite: 30 files, 225 tests, all passing.)
- [x] 6.3 (Optional, recommended) Load the built extension, file a Claude conversation into a folder, switch to a Gemini tab, and confirm the folder shows that conversation under "All" and hides it under a Gemini filter — badge matching rows throughout. **Not run** — optional manual smoke test requiring an interactive browser; the behavior is covered by the automated 5.2/5.3/5.5 tests (unified render, platform narrowing, badge-equals-rows, active highlight).
