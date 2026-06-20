## Why

The prompt library is now usable (slices 1–3), but it is only reachable by switching to the Prompts tab
and scrolling — there is no way to jump to a prompt from the global "Search everything" overlay, even
though that overlay is the panel's primary find affordance. This change is **slice 4 of `prompts-library`**
(the final slice): global search **surfaces prompts alongside conversations**, and selecting a prompt
**navigates to it in the Prompts tab** via the `openPrompt(id)` seam slice 3 already exposes. It completes
the loop — one search box finds everything the workspace holds.

Per the slice-1 exploration (Q3), prompts are **not** folded into the conversation postings index: that
index is conversation-shaped (`nativeId`, platform tab) and prompts open *inside* the panel, not in a host
tab. The prompt set is tiny (25 free / hundreds Pro) and already local, so a direct in-worker filter over
the library is the right tool — keeping the privacy boundary and the postings pipeline untouched.

## What Changes

- Extend the prompt worker (`core/prompts/handlers.ts`) with a **`prompt.search` selector** on the
  existing `prompts.query` kind: `{ kind: 'prompt.search'; terms }` → ranked `PromptSearchResult[]`. The
  worker filters the library (AND across terms) over title, body, description, tags, and slug; ranks title
  matches above body; builds a highlighted snippet; and excludes tombstones. No postings index — a direct
  scan of the small library.
- Add the result shape `PromptSearchResult` (`shared/prompts.ts`): `{ id, title, snippet:
  SnippetSegment[], targetModels, slug? }` — the fields a result row renders, reusing the search overlay's
  `SnippetSegment` so prompt rows highlight exactly like conversation rows.
- Add `ui/search/usePromptSearch.ts` — a small hook taking the overlay's query text, debouncing it,
  issuing `prompt.search`, dropping stale responses via a monotonic ticket, and re-querying on
  `state.changed`. Mirrors `useSearch`, prompts-only.
- Modify `ui/search/SearchOverlay.tsx` — compose `usePromptSearch(queryText)` next to the existing
  `useSearch`, render **two labelled result groups** ("Conversations", "Prompts") in one listbox with
  **unified keyboard navigation** across both, and route selection: a conversation row opens via
  `openConversation` (unchanged); a **prompt row calls a new `onOpenPrompt(id)` prop and dismisses the
  overlay**. The empty state shows only when *both* groups are empty.
- Modify `ui/sidebar/SidebarShell.tsx` — pass `onOpenPrompt={(id) => { select Prompts tab; open that
  prompt; close search }}` to `SearchOverlay`, reusing the exact internal handler behind the slice-3
  `openPrompt` seam.

Out of scope: putting prompt content into the conversation **postings index** (deliberately avoided —
privacy + shape mismatch); slash-command **insertion** of a found prompt (C13 — selection opens the
editor, it does not insert); ranking sophistication beyond title-over-body + recency (kept light for a
small corpus); usage-weighted ranking (C25).

## Capabilities

### New Capabilities
<!-- None. -->

### Modified Capabilities
- `prompts`: add a **prompt search query** requirement — a worker `prompt.search` selector returning the
  library's prompts that match all query terms (over title/body/description/tags/slug), ranked
  title-over-body, with a highlighted snippet, excluding tombstones. Runs entirely on-device over the
  local library; results never enter the sync envelope or the conversation index.
- `search`: the **search overlay** gains a prompts result group and prompt navigation — it renders
  conversation and prompt results as two groups in one keyboard-navigable listbox, and a selected prompt
  navigates to the Prompts tab (via a navigation callback) instead of opening a host tab. Conversation
  behavior is unchanged. This modifies the shipped overlay requirement, so it is spec-level.

## Impact

- **Modified** `extension/src/core/prompts/handlers.ts` (the `prompt.search` selector + match/rank/snippet
  helper) and `extension/src/shared/prompts.ts` (`PromptSelector` + `PromptSnapshot` gain the
  `prompt.search` variant; new `PromptSearchResult`). Reuses `SnippetSegment` and may reuse the search
  `normalize` helper for tokenizing terms — both inside `core/`, dependencies inward.
- **New** `extension/src/ui/search/usePromptSearch.ts`; **modified** `SearchOverlay.tsx` (two groups +
  unified nav + `onOpenPrompt`) and `SidebarShell.tsx` (wire `onOpenPrompt` to the slice-3 seam). The
  overlay imports the prompt client from its leaf module so the bundle stays free of the worker engine.
- **No new request kinds, no new permissions, no network, no schema/migration.** The `prompt.search`
  variant rides the existing `prompts.query` kind. `Prompt` records stay syncable metadata; search runs
  locally and the postings index is untouched (prompt content never enters it).
- **Tested**: Vitest for the worker `prompt.search` (matching across fields, AND semantics,
  title-over-body ranking, snippet highlighting, tombstone exclusion, empty terms); happy-dom for the
  overlay (two groups render, unified keyboard nav across the boundary, selecting a prompt calls
  `onOpenPrompt` and closes, combined empty state) with injected views; real-browser keyboard pass that a
  found prompt navigates to the Prompts tab.
- **Downstream**: closes out `prompts-library`. C13 later turns a found prompt's selection (or a new
  action on the row) into an insertion path; C25 can weight ranking by usage.
