## Why

The workspace currently paints nothing (or a flash of empty) while the folder tree and
conversations load, and the background bulk-indexer runs invisibly — the user gets no signal that
their conversations are being indexed. D18 call for **skeleton loaders** instead of
blank states and a **non-blocking "indexing N conversations…" indicator** (design screens
`docs/design/Screens Export/06 States/02–03`). The plumbing already exists — `useWorkspace`
tracks a `loading | ready | error` status, and the worker already broadcasts `index.progress`
(`{ done, total }`); `messages.ts` notes "C8 ships the signal but no indicator UI … the indexing
indicator (C11) can render it later." This change ships that missing UI.

## What Changes

- Add a reusable **`Skeleton` base component** (shadow-DOM-aware, token-styled, accessible) to the
  UI primitives — a shimmer/placeholder block usable for rows, lines, and blocks.
- Render **skeleton loaders** in the sidebar body while the workspace is loading
  (`useWorkspace.status === 'loading'`) instead of a blank/empty surface — a small set of
  placeholder rows matching the conversation/folder list layout. The empty-state card still shows
  only on a resolved-but-empty workspace, never during load.
- Add a **non-blocking indexing indicator** in the sidebar shell: a slim banner ("Indexing N
  conversations… X%") that subscribes to the existing `index.progress` broadcast via the
  `subscribe()` seam, renders the count and percent (`done`/`total`), and auto-dismisses when
  indexing completes (`done >= total`). It never blocks interaction with the rest of the panel.
- Tests for all of the above are authored by a sub agent (see tasks.md).

## Capabilities

### Modified Capabilities

- `ui-shell`: the base UI components gain a `Skeleton` loader primitive that renders from theme
  tokens inside the shadow-DOM harness.
- `sidebar-shell`: the shell body renders skeleton loaders while the workspace is loading (rather
  than blank), and the shell shows a non-blocking indexing indicator driven by the
  `index.progress` broadcast that auto-dismisses on completion. The existing empty-state card
  (which already presents a primary action) is unchanged.

## Impact

- **Code:** new `ui/components/Skeleton.tsx` (+ tokens in the relevant styles); a new
  `ui/sidebar/useIndexProgress.ts` (subscribes to `index.progress`) and an indicator component;
  `ui/sidebar/SidebarShell.tsx` (mount the indicator) and `ui/sidebar/ConversationList.tsx` /
  body (render skeletons while loading). No worker, messaging-contract, store, or manifest
  changes — the `index.progress` broadcast and the load-status fields already exist.
- **Data:** none.
- **Privacy:** none — the indicator shows only an aggregate count/percent already computed locally;
  no content, no network.
- **Dependencies:** builds on `search`/`conversation-index` (the `index.progress` signal, C8 ✅)
  and `folders`/`sidebar-shell` (the workspace status + shell, ✅). No new dependencies.
