## Why

Conversation rows in the sidebar expose only one action — *Move to folder* — via a lone
icon button, while folders already have a full right-click context menu. Design
`08 Context menu · Conversation.png` calls for conversation rows to carry the same menu
affordance (Move to…, Pin, Archive, Set colour), giving conversations the same lightweight
organization controls folders have, without leaving the list.

## What Changes

- Conversation rows gain a context menu (right-click **and** a keyboard-reachable `⋯`
  trigger), mirroring the folder `useMenu` (Zag) pattern already in `Sidebar.tsx`.
- The menu surfaces four actions:
  - **Move to…** — reuses the existing `conversation.assign` flow + `MoveToFolderPicker`.
  - **Pin to top** — new; pins a conversation to the top of its list.
  - **Archive** — new; hides a conversation from the main list while retaining it.
  - **Set colour** — new; an inline swatch row reusing the folder palette.
- `ConversationIndex` gains three additive, local-only fields: `pinned?`, `archived?`,
  `color?`.
- Three new single-writer mutation ops: `conversation.pin`, `conversation.archive`,
  `conversation.recolor`, handled in the worker and broadcast on the `conversations` store.
- The conversation list sorts pinned conversations to the top and hides archived ones.
- **Rename** and **Delete** from the design are **deferred** — they conflict with the
  ingest pipeline (re-ingest would resurrect the host title / a deleted row) and need
  separate `titleOverride` / dismissed-tombstone work. They are out of scope here.

## Capabilities

### New Capabilities
- `conversation-organization`: conversation-level pin, archive, and colour state, plus the
  conversation-row context menu that surfaces those actions together with the existing
  move-to-folder assignment, including pinned-to-top sorting and archived hiding in the list.

### Modified Capabilities
<!-- None. Conversation→folder assignment behavior under `folders` is unchanged; the context
     menu is a new surface over the existing `conversation.assign` op, not a requirement change. -->

## Impact

- **Schema / store:** additive `pinned` / `archived` / `color` fields on `ConversationIndex`
  (`shared/types.ts`); an additive store migration in `core/store` (never mutate an existing
  one, per `[STORE]`). Each mutation `put()` bumps the sync envelope automatically — but these
  fields are on a **local-only** record and never sync (`[PRIV]` boundary preserved).
- **Messaging / worker:** new `conversation.pin` / `.archive` / `.recolor` entries in the
  `MutationOp` union (`shared/workspace.ts`) and handlers in `core/folders/handlers.ts`, with
  `setPinned` / `setArchived` / `setColor` helpers mirroring the folder equivalents.
- **UI:** `ConversationList.tsx` gains the context menu (replacing the single move icon
  button) using the `useMenu` primitive; an inline colour-swatch row is net-new UI reusing
  the folder `PALETTE`. Keyboard-operable, ARIA-labelled, tokens-only, no hard-coded
  user-facing strings (`[PREACT]`).
- **Tests:** unit coverage for the three handlers, the list sort/hide behavior, and the menu
  interactions; a browser test for the shadow-DOM menu if warranted.
