## 1. Worker prompt search

- [x] 1.1 In `shared/prompts.ts`, add the `prompt.search` variant to `PromptSelector`
  (`{ kind: 'prompt.search'; terms: string[] }`) and to `PromptSnapshot`
  (`{ kind: 'prompt.search'; results: PromptSearchResult[] }`); define `PromptSearchResult`
  (`{ id; title; snippet: SnippetSegment[]; targetModels: PlatformId[]; slug? }`).
- [x] 1.2 In `core/prompts/handlers.ts`, handle `prompt.search`: normalize terms (reuse the search
  `normalize` helper), match AND across title/body/description/tags/slug, rank title-over-body with a
  recency tiebreak, build a highlighted `SnippetSegment[]`, exclude tombstones; empty terms → `[]`.
- [x] 1.3 Keep prompt content out of `searchPostings` — this is a direct library scan (no index writes).

## 2. Overlay data layer

- [x] 2.1 Add `ui/search/usePromptSearch.ts`: takes the query text, debounces, issues `prompt.search` via
  the prompt client (leaf import), drops stale responses via a monotonic ticket, re-queries on
  `state.changed`; returns `{ results: PromptSearchResult[]; status }`. Mirror `useSearch`.

## 3. Overlay + shell wiring

- [x] 3.1 In `SearchOverlay.tsx`, compose `usePromptSearch(queryText)` beside `useSearch`; render two
  labelled groups (Conversations, Prompts) in one listbox; a group with zero results renders no header.
- [x] 3.2 Unify keyboard navigation over a flattened `[...conversations, ...prompts]` active index; map an
  index back to its group for rendering and for the open action.
- [x] 3.3 Route selection by type: conversation → `openConversation` (unchanged); prompt → new
  `onOpenPrompt(id)` prop then `onClose`. Combined empty state only when both groups are empty.
- [x] 3.4 In `SidebarShell.tsx`, pass `onOpenPrompt={(id) => { setActiveTab('prompts');
  setPendingPromptId(id); setSearchOpen(false); }}` to `SearchOverlay`.
- [x] 3.5 Add token-only styles + `STR` entries for the group headers and prompt rows; keep everything
  keyboard-operable and ARIA-labelled.

## 4. Tests

> **Test-contract pins** (the TDD tests in this change assume these exact names — implement to match):
> the overlay injects the prompt source via a `promptView?: PromptSearchView` prop (parallel to the
> existing `view?: SearchView`), `PromptSearchView` exported from `ui/search/usePromptSearch.ts`; each
> group header carries `data-testid="sk-search-group-header"`; the prompt-navigation prop is
> `onOpenPrompt`.


- [x] 4.1 Worker `prompt.search` (Vitest + fake-indexeddb): field matching, AND semantics,
  title-over-body ranking, snippet highlighting, tombstone exclusion, empty-terms → `[]`.
- [x] 4.2 Overlay (happy-dom, injected views): two groups render; a zero-result group shows no header;
  keyboard nav crosses the boundary; selecting a prompt calls `onOpenPrompt` and closes; combined empty
  state only when both are empty; conversation opening unchanged.
- [x] 4.3 Real-browser (`tests/browser/`): keyboard-only — type a query, navigate to a prompt result,
  select it, and assert the panel switches to the Prompts tab with that prompt open.

## 5. Verify

- [x] 5.1 `npm run typecheck`, `npm run lint`, `npm test`, then `npm run test:browser`. All green.
- [x] 5.2 `npm run build` + `npm run check:size` — within bundle budgets.
