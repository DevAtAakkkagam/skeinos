## 1. Data model & store

- [x] 1.1 Add optional `pinned?: boolean`, `archived?: boolean`, `color?: string` to `ConversationIndex` in `src/shared/types.ts`
- [x] 1.2 Add an additive store migration in `core/store` (version bump; do not mutate existing migrations) and confirm the `conversations` store reads existing rows without the new fields
- [x] 1.3 Verify `conversation.ingest` upsert preserves the new fields on re-ingest (add/extend a unit test)

## 2. Mutation ops & handlers

- [x] 2.1 Add `conversation.pin` / `conversation.archive` / `conversation.recolor` to the `MutationOp` union in `src/shared/workspace.ts`
- [x] 2.2 Add pure `setPinned` / `setArchived` / `setColor` helpers for conversations, mirroring the folder equivalents
- [x] 2.3 Handle the three ops in `core/folders/handlers.ts` (load row, apply helper, `put`, return `{ stores: ['conversations'] }`); reject a missing conversation id like `requireFolder`
- [x] 2.4 Unit tests: pin/unpin, archive/unarchive, set/clear colour, and missing-id rejection — assert the broadcast store and that `put` bumped the sync envelope

## 3. Conversation list sort & hide

- [x] 3.1 Add pure helpers to filter out archived and sort pinned-first then most-recent-within-group, preserving `RENDER_CAP` and active-row highlight
- [x] 3.2 Apply the helpers in `ConversationList.tsx`
- [x] 3.3 Unit tests for the sort/hide helpers (pinned above unpinned; archived excluded; ordering within group)

## 4. Conversation row context menu (UI)

- [x] 4.1 Replace the single move icon button in `ConversationList.tsx` with a `useMenu` (Zag) context menu mirroring the folder pattern in `Sidebar.tsx` (right-click + keyboard-reachable `⋯` trigger, `menuTargetId`, `ConvMenuAction` union, `performMenuAction` dispatcher)
- [x] 4.2 Wire menu items: Move to… (opens existing `MoveToFolderPicker`), Pin to top / Unpin, Archive / Unarchive — issuing the matching mutation ops; omit Rename and Delete
- [x] 4.3 Add the inline colour-swatch row to the menu reusing the folder `PALETTE` + clear/no-colour chip, issuing `conversation.recolor`
- [x] 4.4 Add a colour indicator on the row for parity with folders (confirm against design 08)
- [x] 4.5 Ensure ARIA labels, keyboard operability, tokens-only styling, and i18n-ready strings (no hard-coded user-facing text) per `[PREACT]`

## 5. Tests & verification

- [x] 5.1 Component test: menu opens, lists the four actions (no Rename/Delete), pin label reflects state, colour swatches issue recolor
- [x] 5.2 Browser (shadow-DOM) test for the menu if warranted (positioning + keyboard focus)
- [x] 5.3 Run `npm run typecheck` + `npm test`, then `npm run test:browser`
- [x] 5.4 Update the `conversation-organization` spec scenarios ↔ tests mapping; tick `tasks.md` boxes as merge gates
