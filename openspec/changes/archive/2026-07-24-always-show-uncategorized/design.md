## Context

The Folders tab body (`ui/sidebar/Sidebar.tsx`) renders, under `status === 'ready'` with no
active folders, one of two things: a slim ghost "+ New folder" row when content exists
elsewhere (`hasContentElsewhere` = unfiled or archived), or otherwise a full `sk-folders-empty`
card ("No folders yet" + body + a "New folder" button). The Unfiled (labelled **Uncategorized**
via `sidebar.unfiled`) section renders only when `unfiledConvs.length > 0`. The `expanded` set
seeds with the `UNFILED` sentinel, but `expandAll` only re-adds it when unfiled chats exist.

`ConversationList` already renders an empty body keyed by `context.kind`; for `kind: 'unfiled'`
it shows `conv.emptyUnfiled` ("No uncategorized conversations"). So the rendering plumbing for an
empty Uncategorized section already exists — it is simply never reached today because the section
is conditional.

The just-completed `adapter-signed-out-detection` change gives the content script a precise
signed-in/out signal (`authedMarker`), but it lives at the content/worker layer and does not
cross into the side panel. The unified-copy decision below deliberately avoids needing it.

## Goals / Non-Goals

**Goals:**

- Make **Uncategorized** a permanent fixture of the Folders tab: always rendered, with a caret
  and a count (`0` when empty), expanded by default so its empty state shows on first paint.
- Give the empty Uncategorized section a single message that is true in every empty case
  (no chats / signed out / all chats filed / mid-ingest), with no auth probing or branching.
- Retire the dedicated "No folders yet" card; the no-folders path renders the existing ghost
  create-folder row. Folder creation stays reachable (ghost row + header "+").

**Non-Goals:**

- No auth/login detection in the panel; do not plumb `authedMarker` to the UI.
- No change to ingestion, counts, loading-skeleton, or error/retry behavior.
- No change to the archive dock, pinned section, or platform/tag filters.
- No per-cause copy variants (signed-out vs all-filed) — one unified string.

## Decisions

**D1 — Uncategorized renders unconditionally.** Remove the `unfiledConvs.length > 0 &&` guard
around the Unfiled section. It always renders its caret, the `sidebar.unfiled` label, and the
count badge (`unfiledConvs.length`, shown even when `0`). The existing `ConversationList` empty
state handles the body when expanded with no rows.

**D2 — Single unified empty copy.** The `kind: 'unfiled'` empty body shows one message —
"Your chats will appear here once you start chatting on a supported AI" — replacing the terse
`conv.emptyUnfiled`. It asserts nothing about auth state, so it stays correct whether the user
is signed out, signed in with no history yet, or mid first-ingest. Accepted trade-off: it reads
slightly generically in the rare "chats exist but all are filed" state (see Risks).

**D3 — Retire the "No folders yet" card.** In the `status === 'ready'` + no-active-folders
branch, always render the ghost "+ New folder" row (drop the `hasContentElsewhere` fork and the
`sk-folders-empty` card). The persistent Uncategorized section now carries the first-run voice,
so the dedicated folder card is redundant. The section-header "+" and the ghost row remain the
folder-creation affordances. `sk-folders-empty` markup and its `sidebar.noFolders` /
`sidebar.emptyBody` strings are removed once unreferenced.

**D4 — Default + expand-all include Uncategorized.** Keep seeding `expanded` with `UNFILED`.
Change `expandAll` to always include `UNFILED` (drop the `unfiledConvs.length > 0` condition) so
"expand all" is consistent with the now-always-present section.

**D5 — Loading and error paths unchanged.** The skeleton (status `loading`) and the
"couldn't load" retry state (status `error`) still own their branches; the always-on
Uncategorized section and its empty state belong strictly to the `ready` path, so an in-flight
or failed read is never presented as an empty workspace.

## Risks / Trade-offs

- **Generic copy in the "all filed" state.** When chats exist but none are unfiled, the unified
  message ("…once you start chatting…") is slightly off — the user has already chatted. Accepted
  per decision; if it grates, the terse `conv.emptyUnfiled` can return for that single case
  behind a `conversations.length > 0` check, without reintroducing auth logic.
- **A persistent "Uncategorized 0" row** adds one always-present row for power users who file
  everything. Mitigated by it being a single collapsible row and a useful, predictable
  un-file drop target/anchor.
- **Test churn.** Any test asserting `sk-folders-empty` or "No folders yet" must move to the
  ghost row + always-present Uncategorized assertions. Bounded and mechanical.
