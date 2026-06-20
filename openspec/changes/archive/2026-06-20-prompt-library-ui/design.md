## Context

The shipped shell (`SidebarShell`) hardwires Folders as the only live tab: the Prompts/Profiles tabs are
disabled stubs, and the body region always renders `Sidebar`, with a platform-filter chip row and a
collapsed-list nudge above it. `useWorkspace` is the proven data-layer pattern (loading/ready/error,
`state.changed` subscription, observe-don't-replay `mutate`, coalesced reconcile). Slice 2 exposes
`queryPromptLibraryRemote` / `mutatePromptLibraryRemote` and a single `prompt.library` snapshot. The
`Dialog` / `Menu` primitives and `PlatformLogo` already exist; the primitives layer was written with "the
M4 prompt library" as an intended consumer.

The design reference is a wide 3-pane desktop layout (nav rail · category+tag column · 3-up card grid).
The side panel is one narrow column (~360px), so the work is a **reflow**, not a port: the nav rail is
already the tab strip, the filter column collapses to a horizontal chip row, and the grid becomes a 1-up
list.

## Goals / Non-Goals

**Goals:**
- A usable Prompts tab: browse, filter (category + tag), create, edit, delete prompts and categories.
- Faithful card: variable chips, target-platform logos, inert slug badge, variable count.
- Pure view over the slice-2 worker; no new contracts; all UI guardrails (shadow DOM, `--sk-*` tokens,
  keyboard, ARIA, no hard-coded strings).
- Leave a clean `openPrompt(id)` seam for slice 4 and an unobtrusive create path for C9's tier nudge.

**Non-Goals:**
- Insertion / slash-command / variable-**fill** modal (C13) — the editor only *previews* variables.
- Global search → prompt navigation (slice 4); usage display (C25); tier enforcement (C9); grid/list
  toggle; category reorder / drag.

## Decisions

### D-A — Per-tab content owns its chrome; the shell swaps by `activeTab`
`SidebarShell` gains `activeTab: 'folders' | 'prompts'` state (Profiles stays disabled). The header,
global search launcher, tab strip, and footer stay constant. The region between is swapped: Folders keeps
its platform-filter row + collapsed-list nudge + `Sidebar`; Prompts renders `PromptsPanel`, which brings
its **own** toolbar + category/tag filter + card list. This keeps the folder-specific chrome from leaking
into the prompts view and minimizes churn to the shipped folder path (it's wrapped in `activeTab ===
'folders'`, not rewritten). *Alternative:* one shared filter row reconfigured per tab (rejected: platform
chips and category chips have different semantics and lifecycles — coupling them complicates both).

### D-B — Counts derived client-side from the unified snapshot; filters are view state
`PromptsPanel` derives `All`/per-category/per-tag counts by grouping `snapshot.prompts` (the worker
returns no counts — slice-2 D-B). The active category and active tags are **ephemeral panel state**
(like the folder platform-filter), never persisted, never a worker round-trip. Filtering is AND across
the category and any selected tags; `All` clears the category narrowing. This guarantees a chip's count
can never disagree with the rows it labels.

### D-C — `usePromptLibrary` mirrors `useWorkspace`, minus the platform machinery
One selector, so the hook is much smaller: `prompts`/`folders` state, `loading|ready|error`,
`state.changed` subscription, a coalesced `refresh`, visibility/focus self-heal, and a `mutate(op)` that
sends once then re-reads (observe-don't-replay). No platform keying, no active-card, no per-platform
staleness guards. `mutate` returns the same `{ ok, applied }` shape; `applied` is checked against the
re-read library for ops with a checkable identity (create→present, delete→absent, rename→new name).

### D-D — The editor sends `body`; variables are preview-only and worker-derived
`PromptEditor` re-parses `body` on input with `parseVariables` purely to **show** the detected variables
(name · default · type) as a live preview, and `tokenizeTemplate` drives the body/card highlight. On
save it sends `prompt.create`/`prompt.update` with `body` and metadata but **never `variables`** — the
worker is the single authority (slice-2 D-C). This keeps one parse-of-record and matches the eventual
fill-modal (C13) reading the same derived `variables`.

### D-E — Clearing optional fields: empty string, not unset
The slice-2 `prompt.update` ignores `undefined` fields, so an optional field (`description`, `slug`)
cannot be returned to *unset* once set. The editor therefore treats an emptied field as `''` and sends
`''` (semantically "no description/alias"); the card treats empty/whitespace as absent. We do not need a
worker change for this slice. *Alternative:* add explicit-clear semantics to the worker op (deferred — not
worth a contract change for cosmetic emptiness).

### D-F — `openPrompt(id)` seam for slice 4
The shell exposes an imperative path: select the Prompts tab and open that prompt's editor (or a
read view) by id. `PromptsPanel`/`SidebarShell` own `activeTab` + the currently-open editor target, so
slice 4's search overlay closes itself and calls `openPrompt(result.id)` — no new state machine later.

### D-G — Card overflow + editor use the existing primitives
The card's `···` menu is `Menu` (Edit/Delete); the editor is a `Dialog`. Reusing them inherits focus
management, ARIA, Esc/backdrop dismiss, and shadow-DOM positioning rather than re-rolling them — exactly
what the primitives layer was built for.

## Risks / Trade-offs

- **Scope: this is the largest slice (panel + card + editor + category mgmt + shell change).** → Bounded
  by what's explicitly deferred (insertion, fill modal, search nav, analytics, tier, view toggle,
  reorder). The four components are independently testable with an injected `usePromptLibrary`.
- **Touching the shipped, tested folder shell could regress folders.** → The folder path is wrapped, not
  rewritten; the existing shell/browser tests must stay green, and a tab-switch test asserts the folder
  view still renders under the Folders tab.
- **A destructive delete (prompt or category) is one click from the card/chip menu.** → Confirm category
  delete (it reassigns prompts) and prompt delete via a lightweight confirm in the `Menu`/`Dialog` flow;
  never lose user input (PRIV nudge principle) — deletes are explicit and reconciled.
- **Narrow-column card density.** → 1-up cards with truncated body excerpts; the variable chips and
  platform logos are the priority signals, matching the design's card footer.

## Migration Plan

No data/schema/contract migration. Rollback is reverting the new `ui/prompts/` module and the
`SidebarShell` diff (the Prompts tab returns to its disabled stub).

## Open Questions

- **Tag filter source** — tags are free-form strings on prompts (no `tags` capability/assignment UI yet,
  C7). This slice derives the tag set from existing prompts' `tags[]` and filters by them; authoring tags
  happens in the editor. Confirm that's sufficient until C7, vs. deferring the tag *filter* to when tag
  management ships. (Leaning: derive-and-filter now, since the data already exists on prompts.)
- **Editor surface** — full `Dialog` modal vs. an inline expanding panel in the narrow column. Leaning
  `Dialog` for focus/keyboard parity with the rest of the shell; revisit if it feels heavy at 360px.
