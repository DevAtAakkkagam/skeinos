## Why

On a fresh install — and whenever the workspace is empty (signed out of every platform, or
mid first-ingest) — the Folders tab leads with a "No folders yet — create a folder to
organise conversations" card. With zero conversations there is nothing to organise, so the
card pitches the wrong first action: an empty folder is useless. Users have no anchor that
explains where their chats will come from. Moving the first-run voice to a permanent
**Uncategorized** section — the place chats actually land — answers "where are my chats?"
at the exact destination, and stops nudging folder creation before there is anything to file.

## What Changes

- The **Uncategorized** (unfiled) section SHALL always render in the Folders tab, even when
  it holds no conversations — with its disclosure caret and a count (`0` when empty), and
  starting expanded so its empty state is visible on first paint.
- The empty Uncategorized section SHALL show a single unified message
  ("Your chats will appear here once you start chatting on a supported AI") that reads true
  in every empty case — no auth detection, no first-run/zero-chats branching.
- **BREAKING (UX, no API):** the standalone "No folders yet" empty-state card is retired.
  When a read succeeds with no active folders, the folder body falls to the existing slim
  ghost "+ New folder" row (already used when content exists elsewhere). Folder creation
  stays available via that row and the section-header "+". The persistent Uncategorized
  section now carries the first-run message instead.

## Capabilities

### New Capabilities

_None — this modifies existing capabilities._

### Modified Capabilities

- `folders`: the unfiled (Uncategorized) section renders unconditionally with a caret and
  count, and shows an empty state when it holds no conversations; the "genuinely empty
  workspace" path renders the ghost create-folder row rather than the "No folders yet" card.
- `sidebar-shell`: the empty-state requirement no longer mandates a dedicated "New folder"
  card; with no active folders the body renders the slim ghost create-folder row, and the
  persistent Uncategorized section provides the first-run explanatory copy.

## Impact

- **UI:** `ui/sidebar/Sidebar.tsx` (drop the `unfiledConvs.length > 0` guard on the Unfiled
  section; remove the `sk-folders-empty` card branch so `status === 'ready'` + no folders
  always renders the ghost row; include `UNFILED` in `expandAll` unconditionally).
- **Conversation list:** `ui/sidebar/ConversationList.tsx` — the `kind: 'unfiled'` empty
  copy becomes the unified first-run message.
- **i18n:** `src/locales/{en,de,fr,es,pt}.ts` (+ pseudo) — new/updated unfiled empty string;
  the now-unused `sidebar.noFolders` / `sidebar.emptyBody` keys are removed if no longer
  referenced. Completeness test must stay green.
- **Tests:** `tests/sidebar*.test.tsx` and any test asserting `sk-folders-empty` /
  "No folders yet"; new assertions for the always-present Uncategorized section + empty state.
