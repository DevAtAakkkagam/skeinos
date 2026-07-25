## Why

Slices 1–2 made the prompt library real (model, parser, worker CRUD) but it has **no surface** — the
Prompts tab in the shell is still a disabled "coming soon" stub. This change is **slice 3 of
`prompts-library`**: the Prompts tab UI — a pure shadow-DOM view over the slice-2 worker that
lets a user browse, filter, create, edit, and delete prompts and categories. It adapts the wide 3-pane
"Prompt library" design into the narrow side-panel column. **End of this slice = the prompt library is
usable end-to-end** (insertion still comes in C13).

## What Changes

- Add `ui/prompts/usePromptLibrary.ts` — the tab's data layer (mirrors `useWorkspace`, simpler: one
  `prompt.library` selector, no platform keying). Reads via `queryPromptLibraryRemote`, re-reads on every
  `state.changed` broadcast, exposes an honest `loading | ready | error` status, and a `mutate` that
  sends once then reconciles by re-reading (observe-don't-replay).
- Add `ui/prompts/PromptsPanel.tsx` — the tab body. A toolbar with **+ New prompt**; a **category chip
  row** (`All` + one chip per category, with **counts derived client-side** from the unified prompt list,
  D-B) reusing the shell's chip pattern; a **tag filter** (the chip row's existing `+ Tag` affordance,
  now live for prompts); the **card list** (1-up, the narrow-column reflow of the design's 3-up grid); and
  explicit **empty states** (no prompts yet → primary "New prompt" action; no match for the active
  filter).
- Add `ui/prompts/PromptCard.tsx` — a card per the design: category icon, the **inert `slug` badge**
  (`/exp`, defined in slice 1, no behavior until C13), title, a **body excerpt** rendered with
  `tokenizeTemplate` so `{{variables}}` show as highlighted chips, the **target-platform logos** (from
  `targetModels`, via the existing `PlatformLogo`), the **variable count** (`2 vars`), and an overflow
  `Menu` (Edit, Delete).
- Add `ui/prompts/PromptEditor.tsx` — a `Dialog`-based create/edit form: title, body (with a **live
  variable preview** re-parsing on input via `parseVariables`), description, tags, a **`targetModels`
  multi-select** (platform toggle chips), a **category picker** (choose existing or create a new one
  inline), and `slug`; Save (create/update), Cancel, and Delete. The client sends `body` only — never
  `variables` (the worker derives them).
- Add lightweight **category management**: create (inline in the editor's picker and a `+ New category`
  affordance) and rename/delete via a category-chip overflow `Menu` (delete reassigns its prompts to
  uncategorized — the slice-2 worker already does this).
- Modify `ui/sidebar/SidebarShell.tsx` — introduce `activeTab` state, **make the Prompts tab interactive**
  (remove its disabled/coming-soon state), and render the folder-specific region (platform filter +
  collapsed-list nudge + `Sidebar`) only under the Folders tab, swapping in `PromptsPanel` under the
  Prompts tab. Header, global search launcher, tab strip, and footer stay. **Profiles stays disabled.**
  Establish an `openPrompt(id)` seam (switch to Prompts tab + open that prompt's editor) that slice 4's
  search → prompt navigation will call.
- Add token-only styles (new `sk-*` classes from `--sk-*` tokens, shadow-DOM scoped) for the panel,
  cards, chips, and editor; everything keyboard-operable, ARIA-labelled, and free of hard-coded
  user-facing strings (a `STR` map), per the PREACT guardrails.

Out of scope (later): slash-command **insertion**, click-to-insert, and the variable-**fill** modal (C13
— the editor only *previews* variables here); global search → prompt result rows + navigation (slice 4 —
this slice exposes the `openPrompt` seam it consumes); usage-count display and most/recently-used views
(C25); free-tier **25-prompt limit** enforcement (C9 — creating is always allowed here); the design's
**grid/list view toggle** (dropped — 1-up list is the only sensible layout in the narrow panel); category
**reorder** / drag-to-categorize (the worker has no reorder op yet).

## Capabilities

### New Capabilities
<!-- None. -->

### Modified Capabilities
- `prompts`: add the prompt-library **presentation** requirements — browsing the library as a filtered
  card list (category + tag filters with client-derived counts), rendering a prompt card (variable chips
  via the tokenizer, target-platform logos, inert slug badge, variable count), creating/editing/deleting
  a prompt through the editor (sending `body`, never `variables`), and managing categories — all as a
  pure view over the slice-2 worker (`state.changed`-driven, observe-don't-replay). Mirrors how the
  `search` capability bundles its overlay UI with its engine.
- `sidebar-shell`: the tab strip's **Prompts tab becomes interactive** and selects a prompt body region;
  the shell swaps the body (and the folder-specific filter/nudge chrome) by active tab. Profiles remains a
  disabled stub. This changes the shipped "disabled future tabs" behavior, so it is a spec-level change.

## Impact

- **New module** `extension/src/ui/prompts/` (`usePromptLibrary`, `PromptsPanel`, `PromptCard`,
  `PromptEditor`, styles). Consumes `core/prompts` client + `template` (slice 1/2), the `Dialog`/`Menu`
  primitives (the primitives layer explicitly names "the M4 prompt library" as a target consumer), and
  `PlatformLogo`. A pure view over worker state — no store/DOM/adapter imports (PREACT).
- **Modified** `extension/src/ui/sidebar/SidebarShell.tsx` (tab state + body swap + `openPrompt` seam).
  The platform filter row and collapsed-list nudge become Folders-tab-only.
- **No new permissions, no network, no new request kinds, no schema/migration.** Pure presentation over
  the existing `prompts.query`/`prompts.mutate` contracts. `Prompt`/`PromptFolder` privacy/sync
  classification is unchanged.
- **Tested**: Vitest + happy-dom for the panel/card/editor logic (filtering + derived counts, variable-
  chip rendering from the tokenizer, editor create/update/delete wiring, category create/rename/delete,
  empty/loading/error states, observe-don't-replay reconcile) with an injected `usePromptLibrary` view;
  the real-browser suite (`tests/browser/`) for tab-switch + shadow-DOM token resolution and keyboard
  operation of the editor `Dialog` and card `Menu`.
- **Downstream**: completes the usable library; slice 4 wires global search results to the `openPrompt`
  seam; C13 adds insertion/fill to the same cards and editor; C9 plugs the tier nudge into `+ New
  prompt`.
