## 1. Active-conversation seam (content → worker → panel)

- [x] 1.1 Add a `conversation.active` report op (content → worker): in `content/index.ts`, after the adapter is ready, call `detectConversation()` and report `{ platform, nativeId, title }` to the worker on load and on in-page (SPA) navigation; send id/title only, never message content.
- [x] 1.2 Add the worker side in `core/folders/handlers.ts`: persist one active-conversation record per platform (durable, single-writer; survives worker death) and broadcast `state.changed` on update.
- [x] 1.3 Add a `conversation.active` `workspace.query` selector + handler returning the active conversation for a given platform (or null), and wire the request/response kinds in `shared/workspace.ts`.
- [x] 1.4 Expose the active conversation through `useWorkspace` (read on refresh, reconcile on `state.changed`/focus/visibility) without holding authoritative state.
- [x] 1.5 Unit-test (Vitest): report persists and survives a simulated worker restart; `conversation.active` returns the latest per platform and null when none; only id/title cross the seam.

## 2. Move-to-folder picker (the primitive)

- [x] 2.1 Build `MoveToFolderPicker` in `ui/sidebar/`: a type-to-filter list of the active platform's non-archived folders (active + pinned) with parent breadcrumbs, styled only from `--sk-*` tokens, no hard-coded user-facing strings.
- [x] 2.2 Add the "Remove from folder" choice, shown only when the target conversation is currently filed; it resolves to `conversation.assign { folderId: null }`.
- [x] 2.3 Full keyboard operation + ARIA: open, type to filter, arrow to navigate, Enter to confirm, Esc to dismiss; roles/labels on input, options, and active selection.
- [x] 2.4 On confirm, issue exactly one `conversation.assign` via `useWorkspace.mutate` (observe-don't-replay) and close on success.
- [x] 2.5 Unit-test: filtering narrows folders, keyboard-only choose assigns, unfile assigns null, picker is inert/closes on Esc, assign is sent exactly once.

## 3. Current-conversation card (path B)

- [x] 3.1 Build `CurrentConversation` card in `ui/sidebar/`: show the active conversation's title and current folder, with an "Add to folder" affordance that opens the picker for it.
- [x] 3.2 Render a neutral empty state (not an error) when no conversation is active for the panel's platform.
- [x] 3.3 Mount the card at the top of the Folders tab in `SidebarShell`.
- [x] 3.4 Unit-test: card reflects the active conversation, opens the picker, files it, and shows the empty state when none is active.

## 4. Conversations list (path A)

- [x] 4.1 Build `ConversationList` in `ui/sidebar/`: render the platform's `conversation.list` rows with title + current folder; a type-to-filter input and a sensible cap/section (note any cap, do not silently truncate).
- [x] 4.2 Add a per-row menu that opens the Move-to-folder picker for that conversation.
- [x] 4.3 Add same-document drag of a row (emit a `conversation` drag payload) onto a folder node; the existing `Sidebar.tsx` drop handler assigns it. Drag is an enhancement; the row menu/picker is the keyboard path.
- [x] 4.4 Make the list a pure view: re-read on `state.changed`; hold no authoritative state.
- [x] 4.5 Mount the list as a section in the Folders tab below the tree.
- [x] 4.6 Unit-test: row menu files via picker, drag payload assigns through the drop handler, list reconciles on `state.changed`, every drag action has a keyboard path.

## 5. E2E + docs

- [x] 5.1 Real-Chromium E2E over the real worker + IndexedDB: file the current conversation keyboard-only via the card → picker; assignment persists across reload.
- [x] 5.2 E2E: file a list-row conversation by dragging it onto a folder; folder count/row updates and persists.
- [x] 5.3 Record the D19↔D25 reconciliation in `docs/DECISIONS.md` (in-panel list is the drag source; host page is not) and update the `folders` spec note that previously said the conversation list is not rendered.
- [x] 5.4 Confirm seams are clean: only id/title cross the active-conversation seam, bulk/multi-select left as a marked follow-up, picker reusable by a future search surface (no hard dependency).
