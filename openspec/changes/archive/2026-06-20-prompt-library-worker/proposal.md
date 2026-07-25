## Why

Slice 1 (`prompt-variable-parser`) settled the `Prompt` model and the pure `{{variable}}` parser, but
nothing can yet **create, read, update, or delete** a prompt — the `prompts` / `promptFolders` IndexedDB
stores have existed (empty) since M0 with no behavior over them. This change is **slice 2 of
`prompts-library`**: the worker-side query/mutate capability that makes the prompt library a live,
persistent thing, so slice 3's Prompts tab is a pure view over it (and the global-search → prompt
navigation of slice 4 has something to query). It mirrors the `folders` capability's single-writer shape
exactly, minus the tree (categories are flat, per the design).

## What Changes

- Add `shared/prompts.ts` — the prompt-library messaging contract (mirrors `shared/workspace.ts`):
  `PromptSelector`, `PromptSnapshot`, `PromptMutationOp`, reusing `MutationResult` (`{ stores }`).
- Add `core/prompts/handlers.ts` — the worker-side single writer for the library, introducing **new
  request kinds `prompts.query` / `prompts.mutate`** on the open `RequestContracts` map via declaration
  merging. It loads from the `prompts` / `promptFolders` repos, applies the mutation, and after any write
  broadcasts the existing `state.changed` with the touched store names so every open tab re-queries.
  - **Reads** — one selector `prompt.library` returns `{ prompts: Prompt[]; folders: PromptFolder[] }`
    (the unified library; category and tag **counts are derived client-side** from this single list, so a
    badge can never disagree with the rows it labels — same principle as conversation lists, D28).
  - **Prompt writes** — `prompt.create`, `prompt.update`, `prompt.delete`. The worker **derives
    `variables` from `body`** by calling slice 1's `parseVariables` on create and on any body change, so
    the persisted `variables[]` is always consistent with the body and clients never send it.
  - **Category writes** — `promptFolder.create`, `promptFolder.rename`, `promptFolder.delete`. Deleting a
    category **reassigns its prompts to uncategorized** (`promptFolderId = null`) so no synced record is
    left pointing at a gone category.
- Add `core/prompts/client.ts` — `queryPromptLibrary` (retry-on-transient read) + `mutatePromptLibrary`
  (single-attempt write), the content/UI-side `send` wrappers; and `core/prompts/index.ts` barrel
  exporting `registerPromptHandlers` + the client.
- Register `registerPromptHandlers()` at the top of `background/index.ts` (before `installMessageHub`),
  so a cold-started worker answers the first prompt query (SW-3).

Out of scope (later slices / changes): the Prompts tab, cards, chip filter, and editor (slice 3, T3.2);
search → prompt navigation (slice 4); the free-tier **25-prompt limit** — enforcement is deferred (C9),
and `prompt.create` is left as the single, documented seam where that check will plug in; usage-count
mutation and analytics (C25); category **reorder** and drag-assign (not in slice 3's core design — addable
later); slash-command **insertion** (C13).

## Capabilities

### New Capabilities
<!-- None. `prompts` already exists (introduced by prompt-variable-parser). -->

### Modified Capabilities
- `prompts`: add the library's behavioral requirements — reading the unified prompt + category library,
  creating/updating/deleting a prompt with worker-derived variables, and creating/renaming/deleting a
  category (with prompt reassignment on delete) — all through the service worker (the single writer) with
  a `state.changed` broadcast on every write. These are **ADDED** requirements; slice 1's data-model and
  parser requirements are unchanged.

## Impact

- **New modules** `extension/src/core/prompts/{handlers,client,index}.ts` and
  `extension/src/shared/prompts.ts`. `core/prompts/handlers.ts` imports `parseVariables` from the
  existing `core/prompts/template.ts` (slice 1) — both inside `core/`, dependencies inward.
- **Modified** `extension/src/background/index.ts` (one `registerPromptHandlers()` call at module top
  level, before `installMessageHub`). No change to `shared/messages.ts` — the `prompts.query` /
  `prompts.mutate` kinds are added by declaration merging from the handler module, exactly as `folders`
  added `workspace.query` / `workspace.mutate`.
- **New request kinds, not an extension of `workspace.*`.** Only one handler may own a request kind, and
  `workspace.mutate` belongs to `core/folders`; prompts are a distinct capability with their own stores
  and tab, so they get their own kind pair (as `search.run` and `conversation.index` did) rather than
  coupling prompt logic into the folders handler.
- **Consumes existing contracts**: the `prompts` / `promptFolders` repos (`put` stamps the sync envelope,
  `delete` writes a tombstone — already wired), the messaging request/response + broadcast hub, and the
  slice-1 parser. No DOM access from `core/`.
- **No new permissions, no network.** `Prompt` / `PromptFolder` stay syncable metadata (`synced: true`)
  exactly as defined; this change adds no fields and no schema/index change, so **no DB version bump and
  no migration**.
- **Tested** with Vitest + fake-indexeddb (mirroring the folder-handler tests): create persists and
  derives variables from the body; update re-derives variables only when the body changes and preserves
  dormant usage fields; delete tombstones; category delete reassigns contained prompts to `null`; the
  `prompt.library` read returns the unified set; every write broadcasts `state.changed` with the right
  store names and a no-touch mutation skips the broadcast.
- **Downstream**: unblocks slice 3 (Prompts tab UI subscribes to `state.changed` and reads
  `prompt.library`) and slice 4 (a text-filtered prompt query for the search overlay).
