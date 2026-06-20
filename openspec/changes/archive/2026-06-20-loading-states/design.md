## Context

Two loading affordances from PRD §6.13 / D18 are missing UI, though their data is already wired:

- **Workspace load status.** `useWorkspace` exposes `status: 'loading' | 'ready' | 'error'`
  (`WorkspaceStatus`), `'loading'` until the first folder-tree read resolves. Today the body
  renders `EMPTY_TREE` during that window, so a loading workspace is indistinguishable from an
  empty one (and from an error pre-resolve). The design screens want skeleton rows there.
- **Indexing progress.** The bulk-index pipeline emits `onProgress(done, total)` and the worker
  broadcasts `{ kind: 'index.progress'; done; total }` per chunk (`conversation-index/handlers.ts`).
  `messages.ts` explicitly reserves this for "the indexing indicator (C11)". The UI subscribes to
  broadcasts through `subscribe(handler)` from `core/messaging` (the same seam `useWorkspace` uses
  for `state.changed`). No indicator consumes it yet.

There is no reusable skeleton primitive (the only "skeleton" reference is the options-page
*scaffold*, unrelated). The sidebar-shell already has an empty-state card with a "New folder"
primary action, so §6.13's empty-state-with-action requirement is already met and is out of scope.

## Goals / Non-Goals

**Goals:**
- A reusable, token-styled, shadow-DOM-aware `Skeleton` primitive.
- Skeleton loaders in the sidebar body while the workspace is loading (never during empty/ready).
- A non-blocking indexing indicator driven by the existing `index.progress` broadcast, auto-
  dismissing on completion.

**Non-Goals:**
- Any worker / messaging-contract / store change — `index.progress` and the status fields exist.
- The degradation notice (`06 States/01`) — that is the adapter-resilience banner, already its own
  capability.
- New empty states or changing the existing empty-state card.
- Prompt-library skeletons — `usePromptLibrary` has the same status field, but the screens scope
  the skeletons to the sidebar/conversation body; prompts can adopt the primitive later.

## Decisions

### D-1: `Skeleton` is a ui-shell base primitive, styled only from tokens
A single `Skeleton` component with size/shape props (e.g. a line/row/block variant), rendered as a
token-styled shimmer block. It lives with the other base components (`ui/components`), styles
exclusively from `--sk-*` tokens (no host CSS, no hard-coded colors), and carries
`aria-hidden`/role treatment so the placeholder is not announced as content. Rationale: skeletons
are cross-cutting; one primitive keeps the sidebar (and later prompts/search) consistent.

### D-2: Skeletons render strictly in the `loading` state
The sidebar body branches on `useWorkspace.status`: `loading → <skeleton rows>`,
`error → existing error/retry`, `ready → tree or empty-state card`. This fixes the current
"loading looks empty" ambiguity. A small fixed number of placeholder rows (matching the row
height/indent of the conversation/folder list) is enough; it need not mirror the eventual count.
Alternative (render skeletons until the *index* finishes) was rejected — skeletons track the
**read** of local state (fast), the indexing indicator tracks the **index build** (slow); they are
different signals and conflating them would keep skeletons up too long.

### D-3: Indexing indicator is a self-contained subscriber that auto-dismisses
A `useIndexProgress()` hook subscribes via `subscribe()` and keeps the latest `{ done, total }`,
exposing a value only while indexing is in flight (`total > 0 && done < total`) and clearing it
when `done >= total` (optionally after a brief settle so "100%" is visible). A slim banner
component renders "Indexing {N} conversations… {pct}%" with a progress bar, mounted in
`SidebarShell` below the tab strip (per the screens), non-blocking and dismissible-by-completion.
Because the worker re-broadcasts from scratch on each bulk run, the hook needs no persistence — a
fresh subscription catches the next run; a run already in progress at mount simply surfaces on its
next chunk broadcast. Rationale: keeps the indicator stateless across worker death ([SW]) without
new storage.

### D-4: No worker or contract changes
The `index.progress` broadcast, its `messages.ts` contract, and the pipeline's `onProgress` all
already exist and ship today (C8). This change is purely additive UI consuming them. If the
indicator needs the *current* progress at mount (not just the next chunk), that would require a
new "query current index progress" request — explicitly deferred; the chunk cadence is frequent
enough that waiting for the next broadcast is acceptable.

### D-5: Tests authored by a sub agent
Per repo convention, a sub agent authors the suite against the contracts pinned in tasks.md: the
`Skeleton` primitive renders from tokens; the body shows skeletons only in `loading` (not
empty/ready/error); `useIndexProgress` surfaces `{done,total}` from a stubbed `index.progress`
broadcast and clears on completion; the banner renders count/percent and disappears when done.

## Risks / Trade-offs

- **[Risk] Indicator misses a run already in progress at mount** → accepted (D-4): the next chunk
  broadcast surfaces it within one chunk; a current-progress query is deferred until shown to be
  needed.
- **[Risk] Skeleton count/layout drift from real rows causes a visible "jump"** → keep the
  skeleton row metrics (height, indent, gap) driven by the same tokens as real rows so the swap is
  visually stable.
- **[Risk] Indicator flicker on tiny/instant indexes** → only render when `total > 0 && done <
  total`; an index that completes in one chunk never shows a partial bar.
- **[Trade-off] Prompt/search skeletons left for later** → the primitive is reusable, so adopting
  them elsewhere is cheap; this change stays scoped to the screens.
