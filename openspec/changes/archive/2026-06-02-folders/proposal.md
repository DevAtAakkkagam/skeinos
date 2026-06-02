## Why

The free tier's core promise is organizing LLM conversations into a folder hierarchy that the
host site doesn't offer. Folders are the foundational M2 slice (LLD T2.1+T2.2): the sidebar tree is
the workspace's primary navigation, and `tags`, `import-export`, and `loading-states` all build on
it. With the store (C1), messaging (C2), and the Claude adapter (C4) in place, this is the first
user-visible workspace capability and the widest M2 unblocker.

## What Changes

- Add `core/folders`: pure folder-tree logic over the `folders` repo — create, rename, move,
  reorder, recolor (color/icon), pin, and archive — with a **depth guard (nest ≤ 5)** and
  **cycle prevention** on move, run in the service worker (the single writer).
- Add conversation→folder assignment: setting `ConversationIndex.folderId` when a conversation is
  moved into a folder, and per-folder/pinned/archive **counts**.
- Add the **sidebar UI** (shadow-DOM Preact, `--sk-*` tokens): the folder tree with pinned and
  archive sections, conversation counts, drag-and-drop (conversation→folder and folder reorder),
  a create/edit folder dialog, and a right-click context menu (move / pin / archive / rename /
  delete) for folders and conversations.
- Wire folder mutations and queries through the existing messaging hub (new `MutationOp`s /
  selectors handled in the worker) and refresh the UI via `state.changed` broadcasts, so all open
  Claude tabs stay consistent and state **persists across reload** (D19).
- Folder counts read the Claude adapter's conversation list via the `platform-adapter` contract;
  no direct DOM access from `core/`.

Out of scope (separate M2 changes): tag assignment/filtering (`tags`, C7), the search index and
overlay (`search`, C8), enforcement of the 5-folder free limit (`tier-gate`, C9), JSON/Markdown
round-trip (`import-export`, C10), and skeleton/"indexing N…" states (`loading-states`, C11). This
change leaves clean seams for each.

## Capabilities

### New Capabilities
- `folders`: the folder organization layer — the tree model and its operations (create/rename/move/
  reorder/recolor/pin/archive) with the depth-≤5 and cycle-prevention invariants, conversation→folder
  assignment and counts, and the sidebar tree UI (drag-drop, dialog, context menu) over the store and
  messaging hub.

### Modified Capabilities
<!-- None. Folders consumes existing workspace-store, messaging, and platform-adapter contracts
     without changing their requirements; the sidebar is a new feature view over ui-shell, not a
     change to ui-shell's requirements. -->

## Impact

- **New module** `extension/src/core/folders/` (tree logic + worker mutation/query handlers) and a
  `features/sidebar/` Preact view mounted via the `ui-shell` harness.
- **Consumes existing contracts**: the `folders` repo + `ConversationIndex.folderId` from
  `workspace-store` (no schema change — both already exist, D6), the `messaging`
  request/response + broadcast hub, and the Claude `platform-adapter` read operations.
- **No new permissions, no network.** Stays inside the single-writer + shadow-DOM + config-driven
  adapter rules.
- **Tested** with Vitest (tree ops: depth guard, cycle prevention, move/reorder/rename, counts) and
  Playwright on the mock Claude host (drag a conversation into a folder; create/edit via dialog;
  context-menu move/pin/archive; persists across reload — D19).
- **Downstream**: unblocks `tags` (C7), `import-export` (C10), `folder-scope` (C18), and feeds
  `loading-states` (C11); the free-tier folder cap is layered on later by `tier-gate` (C9).
