## Context

The store (`workspace-store`, C1), messaging hub (C2), and Claude adapter (C4) are applied. The
`folders` object store and `ConversationIndex.folderId` already exist in the M0 schema (D6), so this
change adds no migration. The host (Claude) gives a flat, ungrouped conversation list; the free-tier
value is grouping those conversations into a nestable, persistent folder tree shown in the overlay
sidebar.

Three spine rules constrain the design: the **service worker is the single writer** (content
scripts/UI never touch IndexedDB — they message the worker), **no memory-only state** in the worker
(it cold-starts; the tree is rebuilt from the store on each wake), and **config-driven adapters**
(conversation enumeration goes through the `PlatformAdapter` contract, never raw DOM in `core/`).

## Goals / Non-Goals

**Goals:**
- A pure, unit-testable folder-tree model with `nest ≤ 5` and cycle-prevention invariants enforced
  at the write boundary.
- Create / rename / move / reorder / recolor (color+icon) / pin / archive folders, plus
  conversation→folder assignment, all as worker-side mutations through the `folders` repo.
- A shadow-DOM sidebar that renders the tree (with pinned + archive sections and live counts),
  supports drag-drop and a right-click context menu, and stays consistent across all open Claude
  tabs and across reloads (D19).

**Non-Goals:**
- Tag assignment/filtering (C7), the search index/overlay (C8), free-limit enforcement (C9),
  import/export (C10), and skeleton/indexing states (C11). Leave seams, don't implement.
- The unified-vs-per-platform scope **toggle** (C18). The `Folder.platformScope` field is honored
  for storage, but Claude is the only platform here so no scope switching UI ships.
- Building the conversation index. Counts derive from the adapter's current conversation list keyed
  by `folderId`; full normalization/indexing is C8.

## Decisions

**D-A: Tree logic is pure and lives in `core/folders`, separate from persistence.**
`buildTree`, `canMove` (depth + cycle check), `move`, `reorder`, and `assignConversation` operate on
plain records and return the records to persist. The worker handler loads from the repo, calls the
pure function, and writes back. Rationale: depth/cycle invariants and ordering are the bug-prone part
and must be exhaustively unit-tested without IndexedDB. Alternative (logic inline in handlers)
rejected — couples invariants to storage and the message layer.

**D-B: Depth and cycle are enforced on `move`, not just `create`.** A move validates that the
destination's resulting subtree depth stays ≤ 5 **and** that the moved folder is not an ancestor of
(or equal to) the target parent. A violating move is rejected as a typed error (via the messaging
error envelope) and **changes nothing** — the dragged item snaps back. Rationale: depth-5 is a
product invariant (T2.1); creation alone can't violate it but moves can.

**D-C: Ordering uses an explicit integer `order` per sibling group.** Reorder rewrites the `order`
of affected siblings within one parent. Combined with the `parentId, order` index from the store,
reads return children pre-sorted. Rationale: matches the existing `folders` index (`parentId, order`)
and keeps drag-reorder deterministic. Fractional ranking considered but rejected as premature for a
5-folder free tier.

**D-D: Mutations and reads ride the existing messaging contracts; no new capability surface.** Folder
ops are new `workspace.mutate` `MutationOp` variants and `workspace.query` selectors handled in the
worker; after a successful mutate the worker emits a `state.changed` broadcast and every subscribed
tab re-queries. Rationale: reuses the C2 hub and its single-writer + broadcast guarantees rather than
inventing a parallel channel; multi-tab consistency falls out for free.

**D-E: Pin and archive are folder flags, not separate stores.** `pinned`/`archived` booleans on
`Folder`; the sidebar derives the pinned strip and the collapsed archive section by filtering. An
archived folder hides from the main tree but retains its children and assignments. Rationale: keeps
one source of truth and makes pin/archive reversible without data movement.

**D-F: Counts are computed, not stored.** A folder's count = conversations whose `folderId` matches
(direct children only, with an aggregate roll-up shown on collapse), computed from the adapter's
conversation list at query time. Rationale: avoids a denormalized counter that the single writer
would have to keep consistent across assignment, move, and archive.

**D-G: Drag-drop and context menu are pure-view interactions that emit mutations.** The sidebar holds
no authoritative state; a drop or menu action dispatches a `workspace.mutate` and optimistically
reflects the pending change, reconciled by the next `state.changed` broadcast. Rationale: honors
"UI is a pure view over worker state" (PREACT guardrail).

## Risks / Trade-offs

- **[Optimistic UI diverges from worker on a rejected move]** → the worker rejects via the typed
  error envelope; the view rolls back the optimistic change and re-renders from the authoritative
  re-query, so a depth/cycle violation visibly snaps back rather than persisting.
- **[Worker cold-start mid-drag loses in-flight intent]** → mutations are single request/response
  messages, not multi-step worker state; an un-acked drop is simply retried/rolled back by the view.
  No durable worker memory is assumed (MV3 rule).
- **[Counts recomputed per query could get costly on large lists]** → scoped to the current Claude
  tab's visible conversation list (not a global scan) and memoized per broadcast; the heavier indexed
  path is C8's concern, not this slice.
- **[Free-tier 5-folder cap not enforced here]** → intentionally deferred to `tier-gate` (C9). Until
  C9 lands, folder creation is uncapped in dev builds; the create handler exposes a single
  choke-point where C9 inserts the limit-with-nudge check, so no rework.
- **[`platformScope` written but not switchable]** → all folders are created with
  `platformScope: 'claude'` (or `'unified'`) consistently so C18's toggle can re-scope later without
  a migration.

## Migration Plan

No schema migration — `folders` and `ConversationIndex.folderId` already exist (D6). Ships behind the
existing overlay; rollback is removing the sidebar feature mount and the folder `MutationOp`/selector
handlers. No data shape changes, so a rollback leaves any created folders intact and readable.

## Open Questions

- Archive presentation: a collapsed section at the bottom of the tree vs. a separate archive view.
  Defaulting to a collapsed in-tree section (matches the "06 States"/sidebar screens); revisit if the
  sidebar designs disagree.
- Whether folder reorder should be allowed across different parents in a single drag (move + reorder
  combined) or only within a parent. Starting with within-parent reorder + explicit move; combined
  drag can follow if the E2E flow needs it.
