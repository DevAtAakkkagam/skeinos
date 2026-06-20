## Context

`core/folders` is the working template: a worker-side single writer that loads from repos on every call
(no in-memory state, so a cold MV3 worker needs no rehydration — SW-1/SW-2), applies a mutation, and
broadcasts `state.changed` so all tabs re-query. The folder browser folds folders + conversations into
one `workspace.query`/`workspace.mutate` pair because they are one domain. Prompts are a *different*
domain (own stores, own tab, own slice-1 parser), so slice 2 reuses the folder *shape* but not its
request kinds. Slice 1 already provides `parseVariables`, and the `prompts` / `promptFolders` repos exist
with the envelope wired (`put` stamps, `delete` tombstones).

## Goals / Non-Goals

**Goals:**
- A live, persistent prompt library: full prompt CRUD + flat-category CRUD through the single writer.
- `variables[]` always consistent with `body`, derived server-side so clients never compute or send it.
- Counts derivable client-side from one unified read (no count selector to drift).
- Mirror the folder handler's testability and broadcast semantics precisely.

**Non-Goals:**
- Any UI (slice 3); search integration (slice 4); insertion (C13).
- Tier-limit enforcement (C9) — `prompt.create` is the seam, left unguarded for now.
- Category nesting/reorder, drag-assign, usage-count writes, analytics (C25).

## Decisions

### D-A — New `prompts.query` / `prompts.mutate` kinds, not an extension of `workspace.*`
A request kind has exactly one handler, and `workspace.mutate` is owned by `core/folders`. Folding prompt
ops into it would force prompt logic to live in (or be dispatched from) the folders module, breaking
capability isolation. So prompts get their own kind pair, declaration-merged into `RequestContracts` from
`core/prompts/handlers.ts` and registered by `registerPromptHandlers()` — exactly how `search.run` and
`conversation.index` are their own kinds. *Alternative:* extend `WorkspaceSelector`/`MutationOp`
(rejected: couples two capabilities, makes the union a cross-domain grab-bag).

### D-B — One read selector `prompt.library` → `{ prompts, folders }`; counts derived client-side
The Prompts tab loads prompts and categories together and they mutate together, so a single snapshot is
atomic and needs one round-trip on tab open. Category counts (`Research · 7`) and tag counts are computed
in the UI by grouping the returned `prompts` — never stored or returned — so a badge can never disagree
with the list it labels (the D28 principle from conversation lists). *Alternative:* separate
`prompt.list` + `promptFolder.list` selectors like folders (rejected here: prompts/categories don't
refresh independently the way adapter-fed conversations do, and a count selector would be a second source
of truth).

### D-C — The worker derives `variables` from `body`; clients send body only
`prompt.create` and `prompt.update` (when `body` is present/changed) call `parseVariables(body)` and
persist the result into `variables[]`. The UI sends the raw `body` and never the parsed variables, so the
parser stays the single authority and a stored prompt's variables can never drift from its body.
*Alternative:* client-parses and sends `variables` (rejected: two parse sites, drift risk, trusts the
client with derived state).

### D-D — `prompt.update` is a partial patch; re-parse only on body change
`prompt.update` carries `{ id }` plus any subset of `{ title, description, body, tags, targetModels, slug,
promptFolderId }` (read-modify-write over the stored record). `variables` is re-derived only when `body`
is part of the patch; dormant fields (`usageCount`, `lastUsedAt`) are preserved verbatim — this slice
never touches them (C25 owns usage). Mirrors the folder handlers' read-modify-write ops.

### D-E — Deleting a category reassigns its prompts to `null`, not orphan-and-leave
`promptFolder.delete` removes the category **and** rewrites every prompt whose `promptFolderId` matched it
to `null` (uncategorized), touching both stores. This avoids leaving a synced `Prompt` pointing at a
deleted category (a dangling ref that would sync). The mutation returns `{ stores: ['prompts',
'promptFolders'] }` so both views refresh; when the category held no prompts it returns just
`['promptFolders']`. *Alternative:* delete the category only and let the UI treat unknown ids as
uncategorized (rejected: leaves stale synced references).

### D-F — Errors mirror `FolderError`; client generates ids
A `PromptError` with a `code` (`notFound`) survives the messaging boundary; `update`/`delete` on a missing
id throw `notFound`. Ids are client-generated UUIDs passed in `create` ops (as folders do), so the worker
stays free of id allocation and creates are idempotent under retry-by-id.

## Risks / Trade-offs

- **Single-attempt writes can drop a response** (the `observe-don't-replay` rule): a create whose response
  is lost must not be replayed. → Same mitigation as folders — writes are single-attempt and the UI
  reconciles by re-reading on the next `state.changed`; client ids make a manual retry idempotent.
- **Category delete fans out a read-modify-write over all matching prompts.** → The library is small
  (tens–hundreds); a full `prompts.query` + targeted `put`s per match is well within budget and matches
  the folder reorder pattern. No index needed (we filter the already-loaded list).
- **No tier limit yet** — a free user could exceed 25 prompts until C9. → Accepted and explicit;
  `prompt.create` is the single, documented enforcement point so C9 is a one-site change.

## Migration Plan

No data or schema migration — no stores, indexes, or fields change. Rollback is reverting the new modules
and the single `registerPromptHandlers()` line in `background/index.ts`.

## Open Questions

- **Category reorder / drag-assign** — deferred; the design's category list is fixed-order
  (`PromptFolder.order` set at create). Add a `promptFolder.reorder` / `prompt.assign` op when slice 3's
  interaction design calls for it.
- **Title/body validation** — the worker stores what it's given (trimmed); should empty-title creates be
  rejected at the worker, or only guarded in the editor (slice 3)? Leaning UI-guard for now, consistent
  with folder rename accepting the UI's validated input.
