## Context

Folders already have a full right-click context menu, built on the `useMenu` (Zag) primitive in
`ui/sidebar/Sidebar.tsx`, with a shared menu machine, a `MenuAction` union, and a
`performMenuAction` dispatcher. Folders carry `pinned` / `archived` / `color` metadata with
worker mutation ops (`folder.pin` / `.archive` / `.recolor`) and pure helpers
(`setPinned` / `setArchived` / setColor) plus list helpers in `core/folders/tree.ts`
(`pinnedFolders`, `nonArchived`).

Conversation rows (`ui/sidebar/ConversationList.tsx`) currently expose only one action — a single
folder icon button that opens `MoveToFolderPicker` (the `conversation.assign` op). The
`ConversationIndex` record has no pin/archive/colour fields. The store and `MutationOp` union have
no conversation-level pin/archive/recolor ops.

`ConversationIndex` is **local-only** (never syncs, per `[PRIV]`) and is **derived from the host
DOM by the ingest pipeline** (`conversation.ingest`), which upserts rows while preserving existing
fields. This change adds organization metadata to that record and a menu to set it, reusing the
folder patterns wherever possible.

## Goals / Non-Goals

**Goals:**
- Give conversation rows a context menu matching design `08 Context menu · Conversation.png` for
  the four in-scope actions: Move to…, Pin to top, Archive, Set colour.
- Add conversation-level `pinned` / `archived` / `color` state via single-writer mutation ops.
- Sort pinned-to-top and hide archived in the conversation list.
- Reuse the folder `useMenu` pattern, palette, and helper shapes rather than inventing new ones.

**Non-Goals:**
- **Rename** and **Delete** (design shows them) — deferred; they fight the ingest pipeline and
  need `titleOverride` / dismissed-tombstone semantics. Not in this change.
- Syncing conversation organization state (these fields stay local-only).
- A separate "Archived conversations" view/section — archived rows are simply hidden here; a
  dedicated recovery surface is a follow-up.
- Virtualization or changing the existing `RENDER_CAP`.

## Decisions

### D1 — One new capability, not a folders-spec modification
Conversation-level pin/archive/colour is genuinely new behavior, so it lives in a new
`conversation-organization` capability. The `folders` capability's "Conversation assignment to
folders" requirement is unchanged: the menu's Move to… is a new *surface* over the existing
`conversation.assign` op, not a requirement change. *Alternative considered:* fold into the
`folders` spec — rejected, it would blur folder-metadata vs conversation-metadata boundaries.

### D2 — Mirror the folder `useMenu` machine in `ConversationList.tsx`
Reuse the `useMenu` / `mergeProps` / context-trigger pattern from `Sidebar.tsx`: one menu machine,
a `menuTargetId` for the row last acted on, a `ConvMenuAction` union, and a `performMenuAction`
dispatcher issuing `mutate(...)` calls. *Alternative:* a bespoke popover — rejected; the Zag menu
already gives us positioning, focus management, and keyboard/ARIA for free, and consistency with
folders matters.

### D3 — New mutation ops, handlers, and helpers mirror folders exactly
Add to the `MutationOp` union (`shared/workspace.ts`):
`{ op: 'conversation.pin'; conversationId: string; pinned: boolean }`,
`{ op: 'conversation.archive'; conversationId: string; archived: boolean }`,
`{ op: 'conversation.recolor'; conversationId: string; color?: string }`.
Handle them in `core/folders/handlers.ts` next to `conversation.assign`, loading the row,
applying a pure `setPinned` / `setArchived` / `setColor` helper, `put`-ing it (which bumps the
sync envelope automatically), and returning `{ stores: ['conversations'] }` for the broadcast.
Rejection for a missing conversation id mirrors `requireFolder`.

### D4 — Additive `ConversationIndex` fields + additive store migration
Add optional `pinned?: boolean`, `archived?: boolean`, `color?: string` to `ConversationIndex`
(`shared/types.ts`). Because the fields are optional and read with defaults, existing rows are
valid without a data rewrite; the store migration is additive (a new version that does not mutate
existing migrations, per `[STORE]`). Ingest already preserves unrecognized/existing fields, so a
re-ingest will not clobber organization state.

### D5 — List sort/hide lives in `ConversationList`, helpers shaped like `tree.ts`
The list filters out `archived` rows, then sorts pinned-first and most-recent-within-group —
preserving the existing `RENDER_CAP` and active-row highlight. Keep the sort/filter as small pure
helpers (testable in isolation), analogous to `pinnedFolders` / `nonArchived`.

### D6 — Inline colour swatches reuse the folder `PALETTE`
Design 08 shows colour swatches inline in the menu (folders only show them in the edit *dialog*),
so an inline swatch row inside the menu is net-new UI. It reuses the existing folder `PALETTE`
constant and the clear/no-colour chip, rendered as a submenu/row that issues `conversation.recolor`.

## Risks / Trade-offs

- **[Inline-swatch-in-menu is new UI]** → Keep it a thin row of token-styled buttons reusing the
  existing palette; cover with a unit/browser test for keyboard reachability and ARIA labels.
- **[Archived rows silently vanish with no recovery surface here]** → Acceptable for this change;
  data is retained and recoverable by unarchive. Flag a follow-up for an archived view; do not
  silently lose state.
- **[Menu pattern divergence from folders]** → Mitigated by reusing the same `useMenu` primitive
  and prop-merging helpers; deliberately *omit* Rename/Delete rather than stub them.
- **[Sync-envelope bump on local-only record]** → `put()` bumps `rev/updatedAt/...` as designed,
  but `ConversationIndex` never leaves the device, so the `[PRIV]` boundary holds; no new code
  needed to suppress sync.

## Migration Plan

1. Land schema field additions + additive store migration (version bump in `core/store`).
2. Add mutation ops + handlers + helpers; broadcast on `conversations`.
3. Wire the menu and list sort/hide in the UI.
4. No rollback data concern: fields are optional/additive; reverting the code leaves
   already-written `pinned`/`archived`/`color` values inert (ignored by older readers).

## Open Questions

- Should pinned conversations render in a distinct "Pinned" sub-section header (as folders do) or
  just sort to the top within the same list? Design 08 implies in-place sort; defaulting to that.
- Is a colour dot shown on the conversation row itself (like folder rows show colour on the label),
  or only used in the menu? Leaning toward a small colour indicator on the row for parity with
  folders — to confirm against the design during apply.
