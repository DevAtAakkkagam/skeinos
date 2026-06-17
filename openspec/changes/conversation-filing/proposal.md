## Why

Folders exist and conversations are already ingested into the store, but there is no way for a
user to actually put a conversation into a folder: the assignment mutation (`conversation.assign`)
and a folder drop-handler are wired, yet nothing in the side panel renders a conversation the user
can act on. The folders spec deliberately deferred the conversation list, so today the headline
"organize your conversations" promise is unreachable from the UI. This change closes that gap with
a keyboard-first filing experience that fits the post-D25 native side panel.

## What Changes

- Add a **"Move to folder" picker** as the primitive filing interaction: a keyboard-operable,
  type-to-filter list of folders (including a "Remove from folder" / unfile choice) that resolves to
  a single `conversation.assign`. This is the accessible baseline that satisfies D19's "move via
  menu" without depending on pointer drag.
- Add the **current-conversation card** (path B): the side panel surfaces the conversation open in
  the active tab with a single "Add to folder" affordance that opens the picker. Optimizes the 80%
  case ("I'm reading this, file it") with no list and no scrolling.
- Add the **conversations list** (path A): a section in the Folders tab listing the active platform's
  conversations with their current folder, each row offering the picker via a per-row menu, plus
  **same-document drag** of a row onto a folder node as a pointer enhancement (drag is additive, the
  picker is the keyboard path).
- Add an **active-conversation seam**: the content script reports the active tab's conversation
  (via the adapter's existing `detectConversation()`) to the worker, and the panel reads it — so the
  current-conversation card reflects what the user is actually looking at. No conversation *content*
  leaves the device; only the existing id/title metadata.
- **BREAKING (spec-level, internal)**: reverse the folders spec's "the standalone
  unfiled-conversation list is not rendered in the sidebar" — the sidebar now renders conversations
  and their filing affordances. No data or API break; the `conversation.assign` mutation is unchanged.

Out of scope (clean seams left): multi-select / bulk filing (a follow-up once the single-item flow
lands — the picker and list are built to extend to it); tags (C7); creating a folder from inside the
picker (nice-to-have, deferred); search-result filing (the `search` overlay can reuse the same picker
later, no dependency here).

## Capabilities

### New Capabilities
- `conversation-filing`: the filing experience — the reusable "Move to folder" picker (type-to-filter,
  keyboard-operable, unfile option), the current-conversation card driven by an active-conversation
  seam from the content script, the conversations list with per-row filing and same-document drag onto
  folders, all as a pure view over worker state that reconciles on `state.changed`.

### Modified Capabilities
- `folders`: the "Sidebar tree with drag-drop and context menu" requirement is amended — the sidebar
  now renders the platform's conversations and their filing affordances (reversing the deferred
  "standalone unfiled-conversation list is not rendered" note), and folder nodes accept a dropped
  conversation row as an assignment within the same document.

## Impact

- **New module** `extension/src/ui/sidebar/` filing UI: a `MoveToFolderPicker` primitive, a
  `CurrentConversation` card, and a `ConversationList` section, mounted inside the existing
  `SidebarShell` Folders tab (shadow-DOM, `--sk-*` tokens, ARIA, no hard-coded strings).
- **Modified** `extension/src/content/index.ts` to report the active conversation, a new
  `workspace.query` selector (e.g. `conversation.active`) + worker handler in
  `extension/src/core/folders/handlers.ts`, and a small persisted "active conversation per platform"
  record so the seam survives MV3 worker death (single-writer rule).
- **Reuses existing contracts**: `conversation.assign` / `conversation.list` mutations and queries,
  the `useWorkspace` view (`mutate` observe-don't-replay reconcile), the messaging hub + `state.changed`
  broadcast, and the adapter's `detectConversation()` read op — no new permissions, no network.
- **Privacy**: only id/title metadata is read for the active-conversation seam; conversation content
  never leaves the device (the hard boundary holds).
- **Docs**: record the D19↔D25 reconciliation (drag source is the in-panel conversation list, not the
  host page) in `docs/DECISIONS.md`; update the `folders` spec note.
- **Tested**: Vitest for the picker (keyboard nav, filter, unfile, assign), the current-conversation
  card, and the list/drag reconcile; a real-Chromium E2E filing a conversation keyboard-only and via
  drag, surviving reload.
