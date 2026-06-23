## Context

Tags are the second organization axis, orthogonal to folders: a conversation lives in
one folder but carries many tags. The substrate already exists from M0 — `Tag` (synced
Repo, `label` index), `conversation.tags` / `prompt.tags` as `string[]`, the `tags*`
multiEntry indexes, and `TIER_LIMITS.*.tags` (FREE = 10) with `assertWithinQuota`. What's
missing is the worker handlers, the shared selector/mutation contract, and the UI. This
change mirrors the established **folders** pattern (`core/folders/` + `shared/workspace.ts`
unions + `SidebarShell` chrome + a `useXLibrary` hook), so it introduces no new
architectural pattern — only a new domain on the same spine.

Load-bearing constraints: the worker is the single writer (SW-1); no memory-only worker
state (SW-2) — handlers rebuild from the store each call; the library is one unified set
(D28) and the UI owns narrowing as ephemeral view state; tier limits block-with-nudge and
never lose input (PRIV).

## Goals / Non-Goals

**Goals:**
- Tag CRUD + multi-tag assignment + deletion cleanup, all through the single writer.
- A live tag-filter (AND semantics) and a tags management view with live counts.
- Tier enforcement on create, reusing the existing quota machinery.
- Zero schema migration — read/write the records and indexes that already exist.

**Non-Goals:**
- Search-query tag filters (the `search` capability / D26) — untouched.
- Per-folder structural scope toggle (M4 / T4.3).
- Tag-specific sync conflict policy beyond the existing envelope (LWW by `rev`).
- Tag hierarchy / nesting — tags are a flat set.

## Decisions

### D-1: The `tags` array stores tag **ids**, not labels

`conversation.tags` / `prompt.tags` hold `Tag.id` values. Rename then only touches the one
`Tag` record; carriers are untouched and re-render the new label on next query. Labels in
the array would force a rewrite of every carrier on rename and risk collisions.
*Alternative (labels-as-keys):* simpler joins but rename/dedup become O(carriers) writes
and a rename could silently merge two tags — rejected.

### D-2: New domain module mirrors `core/folders/`

Add tag query + mutate handling in the worker (a `core/tags/` module registering through
the messaging hub), extending the declared M2 seam in `shared/workspace.ts`:
- `WorkspaceSelector` += `{ kind: 'tag.list' }` → `WorkspaceSnapshot` += `{ kind: 'tag.list'; tags: Tag[] }`.
- `MutationOp` += `tag.create | tag.rename | tag.recolor | tag.delete | conversation.tag | prompt.tag`
  (the last two carry `{ id, tagId, assigned: boolean }`).

Every mutation writes through the Repo (envelope stamped) and the worker broadcasts
`state.changed`; the UI re-queries. This is exactly the folders flow, so the contract
suite and multi-tab behavior carry over.

### D-3: Deletion cleanup walks carriers via the `tags*` index

`tag.delete` (a) writes a tombstone for the `Tag`, then (b) finds carriers through the
`tags` multiEntry index on `conversations` and `prompts` (not a full-table scan), and
rewrites each to drop the id — all in the same single-writer call before the broadcast.
The `MutationResult.stores` lists every store touched so the broadcast invalidates the
right queries. *Alternative (lazy cleanup / dangling ids tolerated by the UI):* avoids the
walk but leaks tombstoned ids into sync envelopes and complicates counts — rejected; eager
cleanup keeps the invariant "no carrier references a deleted tag" true in storage.

### D-4: Filtering and counts are client-side, ephemeral view state

The tag-filter selection lives in the UI workspace store next to `platformFilter` — not
persisted, not synced. The rendered list is the unified `conversation.list` narrowed by
`platformFilter` **and** the selected tag set (AND over `tags`). Counts in the tags view
derive from the same unified list (`countByTag`), so a tag's count equals the rows its
filter renders, by construction (same guarantee D28 gives folder badges). No worker
selector computes counts.

### D-5: Create is gated; assignment is not

Only `tag.create` consumes quota (`assertWithinQuota('tags', liveCount, tier)` before the
write), surfacing `quota_exceeded` with `{ resource:'tags', count, limit }`. Assigning an
existing tag to many conversations does not create tags, so it is unbounded on any tier —
the cap is on the number of distinct tags, matching `TIER_LIMITS`. The create UI catches
the code and renders `<UpgradeNudge resource="tags" />`, preserving the typed label.

### D-6: UI surfaces — a `useTagLibrary` hook + chrome

A `useTagLibrary` hook (mirroring `usePromptLibrary` / `useProfileLibrary`) wraps the
query/mutate client for the tags view and the assignment affordance. `SidebarShell`
activates the `sk-chip--add` seam: "+ Tag" opens a picker over existing tags; chosen tags
become toggleable filter chips carrying the tag color. A tag-assignment affordance on
conversation rows (and the prompt editor for prompts) toggles `conversation.tag` /
`prompt.tag` ops.

## Risks / Trade-offs

- **[Carrier walk on delete is O(carriers)]** → bounded by the multiEntry index lookup (only
  records carrying the tag), and tag counts are tier-capped, so the fan-out stays small.
- **[Stale ids if a delete races a concurrent assign across tabs]** → single-writer
  serializes both; the assign validates the tag id still exists (D-2) and the post-delete
  broadcast re-queries every tab, so a just-deleted tag can't be re-attached.
- **[Filter + tags view counts drift if computed in two places]** → both derive from the
  one unified list via shared client-side selectors (`countByTag`), so they cannot diverge.
- **[`sk-chip--add` seam restyle could regress the Folders filter row]** → the platform-filter
  chip group and its tests already exercise that row; the tag group reuses the same chip
  classes and adds its own `data-testid`s.

## Migration Plan

No data migration — `Tag`, the carrier `tags` arrays, the `tags*` indexes, and the tier
limit all ship in the M0 schema. Deploy is purely additive (new handlers + UI); rollback is
removing the new selector/mutation kinds and the UI — existing records are unaffected
because nothing wrote new shapes.

## Open Questions

- **Tag picker UX for "+ Tag":** inline popover vs. routing to the tags view to pick — lean
  popover for filtering, defer if it complicates the first slice.
- **Prompt tag-filter:** this change wires conversation-side filtering in the Folders tab;
  whether the Prompts tab gains a parallel tag filter (vs. its existing category chips) is
  left to the Prompts capability — assignment to prompts is in scope, prompt-side filtering UI is not.
