## 1. Types and tree logic (pure core)

- [x] 1.1 Add/confirm the `Folder` record type and a `FolderTreeNode` view type in `shared/` (id, name, parentId, platformScope, color, icon, order, pinned, archived + sync envelope).
- [x] 1.2 Implement `buildTree(folders)` in `core/folders` returning a sorted nested tree (children ordered by `order`), with pinned and archived partitioning helpers.
- [x] 1.3 Implement `depthOf(folder, byId)` and `canMove(moverId, targetParentId, byId)` enforcing depth ≤ 5 and cycle prevention (mover cannot be the target or an ancestor of it).
- [x] 1.4 Implement pure ops `createFolder`, `renameFolder`, `recolorFolder` (color/icon), `setPinned`, `setArchived`, `moveFolder`, and `reorderSiblings` returning the records to persist.
- [x] 1.5 Implement `assignConversation(convId, folderId|null)` and `countByFolder(conversations)` (direct-child counts).
- [x] 1.6 Unit-test (Vitest) every invariant: depth guard, cycle rejection leaves tree unchanged, reorder updates sibling `order` deterministically, reassign replaces prior folder, counts track assign/remove/archive.

## 2. Worker mutations and queries (single writer)

- [x] 2.1 Add folder `MutationOp` variants (create/rename/recolor/pin/archive/move/reorder/assign/delete) and `WorkspaceSelector` variants (folder tree, counts) to the messaging types.
- [x] 2.2 Register synchronous worker handlers that load from the `folders` repo, call the pure ops, and persist via `Repo.put`/`Repo.delete` (tombstone) — rebuilding state from the store on cold start, no memory-only state.
- [x] 2.3 Return a typed error envelope for rejected moves/creates (depth/cycle) without writing any record.
- [x] 2.4 Emit a `state.changed` broadcast after each successful folder mutation.
- [x] 2.5 Route conversation enumeration for counts through the Claude `platform-adapter` read contract (no direct DOM in `core/`).
- [x] 2.6 Integration-test (Vitest + fake-indexeddb): mutate→persist→re-query round-trips, rejected-move leaves store unchanged, broadcast fires on success.

## 3. Sidebar UI (shadow-DOM, pure view)

- [x] 3.1 Scaffold `ui/sidebar/` mounted via the `ui-shell` harness; render the folder tree with pinned and archive sections and per-folder counts from worker queries, styled only from `--sk-*` tokens.
- [x] 3.2 Subscribe to `state.changed` and re-query so the tree stays current; hold no authoritative state in the view.
- [x] 3.3 Implement the create/edit folder dialog (name + optional color/icon), dispatching create/rename/recolor mutations; keyboard-operable and ARIA-labelled, no hard-coded user-facing strings.
- [x] 3.4 Implement drag-drop: conversation→folder assignment and folder re-parenting; reorder via context menu; rejected mutations reconcile against the authoritative re-query.
- [x] 3.5 Implement the right-click context menu for folders and conversations (move, pin, archive, rename, delete) dispatching the matching mutations.

## 4. End-to-end and verification

- [x] 4.1 Real-Chromium E2E (Vitest browser / Playwright provider) over the real worker + IndexedDB: drag a conversation into a folder and assert the count updates.
- [x] 4.2 E2E: create a folder via the dialog; context-menu pin/archive; assert the tree updates.
- [x] 4.3 E2E: reload the overlay and assert the tree, assignment, and counts persist (D19).
- [x] 4.4 E2E: a cyclic move is rejected and the tree is left unchanged.
- [x] 4.5 Confirm the leftover seams are clean (no tag/search/limit/import code added) and update `docs/OPENSPEC_CHANGES.md` C6 status.

> Note: the repo's E2E layer is Vitest browser mode driven by the Playwright provider in real Chromium (`vitest.browser.config.ts`); the "Playwright" tasks are implemented there rather than via a separate Playwright runner, and the sidebar lives under `ui/` (matching `ui/options`) rather than a new `features/` tree.
