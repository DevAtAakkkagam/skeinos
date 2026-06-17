## Context

Conversations are already ingested (`content/index.ts` → `conversation.ingest` →
`ConversationIndex` with `folderId: null`), `conversation.list` returns them per-platform, and
`conversation.assign` + a folder drop-handler in `Sidebar.tsx` are wired. The only gap is a UI to act
on conversations. Since **D25** the workspace lives in a native side panel — a separate document from
the host tab — so HTML5 drag cannot cross the tab↔panel boundary, and the PRD/D19 vision of dragging
from Claude's own list into a folder is not achievable as written. The drag source must live inside
the panel. The adapter already exposes `detectConversation()` (active conversation by URL match), and
`useWorkspace` already provides the observe-don't-replay `mutate` + `state.changed` reconcile.

## Goals / Non-Goals

**Goals:**
- A keyboard-first **"Move to folder" picker** as the single filing primitive, reused by both entry
  points; full keyboard operation + ARIA; type-to-filter; an explicit "Remove from folder" choice.
- **Current-conversation card** (B): file the active tab's conversation in one action.
- **Conversations list** (A): browse the platform's conversations, file any via the picker, and (as a
  pointer enhancement) drag a row onto a folder within the panel.
- An **active-conversation seam** that survives MV3 worker death and reflects the active tab.
- Stay a pure view over worker state; reuse `conversation.assign` unchanged.

**Non-Goals:**
- Bulk/multi-select filing (follow-up; the picker/list are shaped to extend to it).
- Cross-document drag from the host page; in-page filing affordances (D25 keeps UI in-panel).
- Creating a folder from within the picker; tags; search-result filing (search can reuse the picker
  later with no dependency here).

## Decisions

- **Picker is the primitive; drag is an enhancement.** The keyboard-operable picker is the accessible
  baseline that satisfies D19's "move via menu". Drag (same-document only) is additive for pointer
  users and never the sole path to an action — honoring the PREACT "everything keyboard-operable" rule.
- **D19 ↔ D25 reconciliation (record in DECISIONS).** "Drag a conversation into a folder" is satisfied
  by dragging a row in the panel's own conversation list onto a folder node — *not* by dragging from
  the host page. The host-page list is no longer a drag source post-D25.
- **Active-conversation seam is single-writer + durable.** The content script reports the active
  conversation (`detectConversation()` → `{ platform, nativeId, title }`) to the worker on load and on
  SPA navigation; the worker persists one "active conversation per platform" record so the seam
  survives worker death and a panel that opens later still sees it. The panel reads it via a new
  `workspace.query` selector `conversation.active` (scoped to its resolved platform). Only id/title
  metadata crosses — never content (privacy boundary holds).
- **Filing resolves to the existing mutation.** Every path (card, list row, picker, drag) ends in a
  single `conversation.assign { conversationId, folderId | null }` through `useWorkspace.mutate`, which
  already reconciles by re-reading after every attempt. No new write path, no replay.
- **Folder set in the picker** = the active platform's non-archived folders (active + pinned),
  presented as a flat type-to-filter list with parent breadcrumbs for disambiguation, plus a pinned
  "Remove from folder" row when the conversation is currently filed. Flat-filter beats tree-navigation
  for keyboard speed and scales past the 5-level depth limit.
- **List source is `conversation.list` for the panel's platform**, showing each conversation's current
  folder name; it reconciles on `state.changed` like the rest of `useWorkspace`. No new store reads
  beyond the active-conversation selector.

## Risks / Trade-offs

- **Active-conversation freshness vs. SPA navigation.** Host sites change the open conversation without
  a full reload; if the content script only reports on load, the card goes stale. Mitigation: report on
  URL change (the adapter already keys active-by-URL); the panel also reconciles on focus/visibility
  (existing `useWorkspace` behavior), so returning to the panel re-reads.
- **Drag is partial by design.** Same-document drag works panel-internally but cannot originate from the
  host list; setting the expectation (picker-first) avoids a "drag is broken" perception. Drag stays an
  enhancement, never the only route.
- **Unbounded conversation list.** A heavy user may have hundreds of ingested conversations; rendering
  all is wasteful. Mitigation for this change: render the platform's list with a type-to-filter input
  and a sensible cap/section ("recent"), leaving virtualization/bulk to the follow-up — and `log`/note
  any cap rather than silently truncating.
- **Reversing a shipped spec note.** Amending the `folders` spec's "list is not rendered" line is a
  spec-level change; captured as a Modified Capability delta so the reversal is explicit and reviewable.
