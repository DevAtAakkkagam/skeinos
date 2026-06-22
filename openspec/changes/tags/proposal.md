## Why

Conversations and prompts already carry a `tags: string[]` field and a `tags` Repo
(synced) exists in the M0 schema, but nothing creates, assigns, filters, or manages
tags — the side panel's "+ Tag" chip and tag-filter row are inert reserved slots.
Tags are the second organization axis (orthogonal to folders): a conversation lives in
one folder but can carry many tags, letting users slice the unified library by topic,
status, or project across platforms. This is C7 / T2.3, unblocked now that the store,
folders, messaging, and tier-gate are in place.

## What Changes

- **Tag CRUD (worker, single writer):** create, rename, recolor, and delete `Tag`
  records through new `workspace.mutate` ops; deletes remove the tag from every
  conversation and prompt that carries it (and write a tombstone via the envelope).
- **Multi-tag assignment:** assign/unassign tags on a conversation and on a prompt
  (a record may carry many tags); assignment writes through the worker, never the UI.
- **Tag-filter view:** the inert "+ Tag" seam in the Folders filter row becomes live —
  picking tags narrows the rendered library to conversations carrying **all** selected
  tags. Like the platform filter (D28), this is **ephemeral view state**, not persisted,
  and never mutates records.
- **Dedicated tags view + counts:** a management surface listing every tag with its live
  usage count, offering rename / recolor / delete; counts derive client-side from the
  unified list so a tag's count equals the rows it filters to, by construction.
- **Tier enforcement:** the tag-create handler calls
  `assertWithinQuota('tags', <live count>, tier)` (FREE = 10, already in `TIER_LIMITS`);
  the create UI catches `quota_exceeded` and renders `<UpgradeNudge resource="tags" />`,
  blocking the create without losing input (PRIV).

Non-goals: search query tag-filters (`search`/D26 — untouched here), per-folder structural
scope (M4/T4.3), and tag-based sync conflict policy beyond the existing envelope.

## Capabilities

### New Capabilities
- `tags`: the Tag lifecycle (create/rename/recolor/delete), multi-tag assignment to
  conversations and prompts, tag-deletion cleanup across carriers, tier-quota enforcement
  on create, the dedicated tags management view with live counts, and the ephemeral
  tag-filter view state that narrows the library.

### Modified Capabilities
- `sidebar-shell`: the tag-filter row — currently specced as a **static, inert slot**
  that dispatches no action — becomes a **live chip group**: a "+ Tag" affordance plus
  one toggleable chip per active filter tag, sibling to the platform view-filter, shown
  only on the Folders tab.

## Impact

- **Schema/records:** no migration — `Tag`, `conversation.tags`, `prompt.tags`, and the
  `tags*` multiEntry indexes already exist (M0/D6). New code only reads/writes them.
- **`shared/workspace.ts`:** extends the `WorkspaceSelector` / `MutationOp` / `WorkspaceSnapshot`
  unions with tag kinds (the declared M2 extension seam).
- **`core/` worker:** new `core/tags/` (or `background/` handler) registering tag query +
  mutate handlers, broadcasting `state.changed` after each mutation (multi-tab consistency).
- **`ui/`:** activates the `sk-chip--add` seam and tag-filter chips in `SidebarShell`; a new
  tags management view + a tag-assignment affordance on conversation/prompt rows; a
  `useTagLibrary` hook mirroring `usePromptLibrary` / `useProfileLibrary`.
- **`core/tier`:** no change — limit exists; this is its first enforcement call site for `tags`.
- **Specs:** new `tags` spec; delta to `sidebar-shell`. `tier-gate` already specs the limit.
