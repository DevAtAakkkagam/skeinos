## 1. Skeleton primitive

- [x] 1.1 Add `ui/components/Skeleton.tsx`: a token-styled placeholder block with size/shape
      options (line / row / block), shadow-DOM-aware, `aria-hidden` so it is not announced as
      content. Add its styles using `--sk-*` tokens only (shimmer/placeholder fill).
- [x] 1.2 Export it from the base-components barrel alongside the other primitives.

## 2. Sidebar body skeletons

- [x] 2.1 In the sidebar body (ConversationList / the folder-tree region), branch on
      `useWorkspace.status`: `loading` → render a small fixed set of `Skeleton` rows matching the
      list row metrics (height/indent/gap from the same tokens); `error` → existing error/retry;
      `ready` → tree or the existing empty-state card.
- [x] 2.2 Ensure the empty-state card renders only in `ready` with no folders, and skeletons never
      remain after the tree resolves.

## 3. Indexing indicator

- [x] 3.1 Add `ui/sidebar/useIndexProgress.ts`: subscribe via `subscribe()` to `index.progress`,
      keep the latest `{ done, total }`, expose a value only while `total > 0 && done < total`,
      and clear it when `done >= total` (optionally after a brief settle so 100% is visible);
      dispose the subscription on unmount.
- [x] 3.2 Add a slim, non-blocking indicator component ("Indexing {N} conversations… {pct}%" with
      a progress bar), strings in an i18n-ready `STR` const, styled from tokens.
- [x] 3.3 Mount the indicator in `SidebarShell` below the tab strip (per the design screens), so it
      overlays/precedes the body without blocking interaction.

## 4. Tests (authored by a sub agent)

- [x] 4.1 `Skeleton`: renders from tokens; re-themes with the active theme; is hidden from
      assistive tech.
- [x] 4.2 Body states: `loading` renders skeletons and not the empty-state card; `ready`+no-folders
      renders the empty-state card and no skeletons; `ready`+folders renders the tree; `error`
      renders the error/retry path.
- [x] 4.3 `useIndexProgress`: surfaces `{ done, total }` from a stubbed `index.progress` broadcast;
      exposes nothing when `total` is 0; clears when `done >= total`; disposes its subscription.
- [x] 4.4 Indicator: renders the count and percent from progress; stays non-blocking; disappears on
      completion and when nothing is indexing.

## 5. Verification

- [x] 5.1 Run `npm run typecheck` and `npm test`; then `npm run test:browser` for the sidebar shell
      (shadow-DOM mount of skeletons + indicator and token resolution).
