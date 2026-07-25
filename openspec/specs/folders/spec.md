# folders Specification

## Purpose

The folders capability defines the on-device organization layer for conversations: a nestable folder tree (with a depth limit and cycle prevention), folder metadata (rename, color, icon, pin, archive), explicit sibling ordering, single-folder conversation assignment, derived per-folder conversation counts, and the shadow-DOM sidebar tree that renders folders with drag-drop and a context menu. All folder reads and mutations flow through the single-writer service worker and broadcast state changes to keep every open tab consistent.

## Requirements

### Requirement: Nestable folder tree with a depth limit

The system SHALL model folders as a tree where each folder has a `parentId` (or `null` for a root
folder), and SHALL reject any create or move that would nest a folder deeper than 5 levels.

#### Scenario: Creating a folder within the depth limit succeeds

- **WHEN** a folder is created under a parent whose depth is less than 5
- **THEN** the folder is persisted with that `parentId`
- **AND** it appears as a child of that parent in the tree

#### Scenario: Nesting beyond five levels is rejected

- **WHEN** a create or move would place a folder at depth 6
- **THEN** the operation is rejected with a typed error
- **AND** no folder record is created or modified

### Requirement: Move with cycle prevention

The system SHALL allow moving a folder to a new parent or to root, and SHALL reject any move that
would make a folder its own ancestor (a cycle), leaving the tree unchanged on rejection.

#### Scenario: Moving a folder under a valid new parent re-parents it

- **WHEN** a folder is moved under a different parent that is not one of its descendants
- **THEN** the folder's `parentId` is updated to the new parent
- **AND** the move keeps the subtree within the depth limit

#### Scenario: Moving a folder into its own descendant is rejected

- **WHEN** a move would set a folder's parent to itself or to one of its descendants
- **THEN** the operation is rejected with a typed error
- **AND** the folder's `parentId` is unchanged

### Requirement: Rename, recolor, pin, and archive

The system SHALL support renaming a folder, setting its `color` and `icon`, toggling `pinned`, and
toggling `archived`, persisting each change through the `folders` repo.

#### Scenario: Renaming and recoloring persist

- **WHEN** a folder's name, color, and icon are changed
- **THEN** the stored folder reflects the new name, color, and icon

#### Scenario: Pinning surfaces a folder in the pinned section

- **WHEN** a folder is pinned
- **THEN** the folder is marked `pinned`
- **AND** it appears in the sidebar's pinned section

#### Scenario: Archiving hides a folder from the main tree but retains it

- **WHEN** a folder is archived
- **THEN** the folder is marked `archived` and removed from the main tree view
- **AND** the folder and its conversation assignments are retained
- **AND** unarchiving restores it to the main tree

### Requirement: Sibling ordering

The system SHALL maintain an explicit integer `order` within each sibling group, and reordering a
folder SHALL update the `order` of the affected siblings so children read back in the intended
sequence.

#### Scenario: Reordering updates sibling order deterministically

- **WHEN** a folder is moved before or after a sibling within the same parent
- **THEN** the `order` values of the affected siblings are updated
- **AND** querying that parent's children returns them in the new order

### Requirement: Conversation assignment to folders

The system SHALL assign a conversation to a folder by setting its `folderId`, and a conversation
SHALL belong to at most one folder at a time; assigning to a new folder replaces the previous
assignment, and assigning to none clears it.

#### Scenario: Assigning a conversation sets its folder

- **WHEN** a conversation is moved into a folder
- **THEN** its `folderId` is set to that folder

#### Scenario: Reassigning replaces the previous folder

- **WHEN** a conversation already in one folder is moved into another
- **THEN** its `folderId` becomes the new folder
- **AND** it no longer counts toward the previous folder

### Requirement: Folder contents are unified across platforms

The system SHALL render, inside an expanded folder, **every** conversation assigned to
that folder regardless of the platform it belongs to — the folder library is unified,
not scoped to the active tab's platform. The same SHALL hold for the unfiled-conversation
list. A folder MUST NOT show an empty body while its count is non-zero solely because its
conversations belong to a platform other than the active tab's.

#### Scenario: A folder shows conversations from every platform

- **WHEN** a folder holds conversations assigned from more than one platform
- **AND** the panel is open on any supported host tab
- **THEN** the expanded folder lists all of those conversations, regardless of which
  platform's tab is active

#### Scenario: A non-empty folder is never shown as empty due to platform

- **WHEN** a folder's count is non-zero but none of its conversations belong to the
  active tab's platform
- **THEN** the folder still renders those conversations (it does not show the empty
  "Nothing here yet" state)

### Requirement: Platform view-filter narrows the unified list

The workspace SHALL offer a platform filter that narrows the unified conversation list
to a single platform. Its default SHALL be "All" (the unified view across every
platform). The filter SHALL be a view control only: it MUST NOT mutate folders or read
or write `Folder.platformScope`.

#### Scenario: Default shows all platforms

- **WHEN** the panel opens
- **THEN** the platform filter is set to "All" and folder contents span every platform

#### Scenario: Selecting a platform narrows the contents

- **WHEN** the user selects a specific platform in the filter
- **THEN** every folder's contents (and the unfiled list) show only that platform's
  conversations

### Requirement: Folder conversation counts

The system SHALL expose, for each folder, a count of the conversations assigned to it,
derived from current conversation data rather than a stored counter, so counts stay
correct after assignment, move, and archive. The displayed count SHALL equal the number
of conversations shown under the active platform filter — the global count when the
filter is "All", and that platform's count when a platform is selected — so the badge
always matches the rendered contents.

#### Scenario: Count reflects current assignments

- **WHEN** conversations are assigned to and removed from a folder
- **THEN** the folder's reported count equals the number of conversations currently
  assigned to it

#### Scenario: Count matches the visible contents under the filter

- **WHEN** the platform filter is "All"
- **THEN** the folder's badge equals the total number of conversations assigned to it
  across every platform (the same set its expanded body renders)

#### Scenario: Count tracks a selected platform filter

- **WHEN** a specific platform is selected in the filter
- **THEN** the folder's badge equals the number of that platform's conversations
  assigned to it, matching the rows its expanded body renders

### Requirement: Sidebar tree with drag-drop and context menu

The system SHALL render the folder tree as the body of the Folders tab in the shadow-DOM
overlay sidebar, with pinned and archive sections that — like the active tree — show each
folder's icon, color, and conversation count, and SHALL let the user create and edit a
folder via a dialog, drag a folder onto another to re-parent it, drag to reorder folders,
and act on a folder via a right-click context menu (move, pin, archive, rename, delete),
with all UI styled from theme tokens and keyboard-operable. The sidebar SHALL also render
conversations across every platform — the unified library, narrowed only by the optional
platform view-filter, never silently scoped to the active tab's platform — and their filing
affordances: a folder node SHALL accept a conversation dropped onto it from the panel's own
conversation list as an assignment within the same document. (Conversations are filed through
the keyboard-first Move-to-folder picker defined by the `conversation-filing` capability;
same-document drag is an enhancement, never the only path.)

The sidebar body SHALL split into a scrolling region holding the live sections (pinned,
folders, unfiled) and a bottom-docked archive region holding the archive sections (archived
conversations and archived folders). The archive region SHALL stay pinned to the bottom of
the panel rather than scrolling away below a long folder list, SHALL be separated from the
scrolling region by a hairline and an opaque background, and SHALL cap its own height and
scroll internally when expanded so it never crowds out the live tree above it. The archive
region SHALL render only when something is archived: the archived-conversations section
SHALL appear only when at least one (platform-visible) conversation is archived, and the
archived-folders section only when at least one folder is archived.

#### Scenario: Pinned and archive rows show icon, color, and count

- **WHEN** the sidebar renders a folder in the pinned or archive section
- **THEN** the row shows the folder's icon and color
- **AND** shows its conversation count, matching the active tree

#### Scenario: Creating a folder via the dialog adds it to the tree

- **WHEN** the user opens the create-folder dialog, enters a name (and optional color/icon), and confirms
- **THEN** a new folder with those properties appears in the tree

#### Scenario: Context-menu actions mutate the target folder

- **WHEN** the user invokes move, pin, archive, rename, or delete from a folder's right-click context menu
- **THEN** the corresponding mutation is applied to the targeted folder

#### Scenario: A rejected folder drag does not change the tree

- **WHEN** a folder drag would violate the depth limit or create a cycle
- **THEN** the operation is rejected
- **AND** the sidebar restores the folder to its original position

#### Scenario: A folder node accepts a dropped conversation

- **WHEN** the user drags a conversation row from the panel's conversation list onto a folder node
- **THEN** the conversation is assigned to that folder via `conversation.assign`
- **AND** the same assignment is reachable without a pointer through the Move-to-folder picker

#### Scenario: The archive region docks to the bottom of the panel

- **WHEN** the sidebar renders with archived content and a folder list taller than the panel
- **THEN** the live sections (pinned, folders, unfiled) scroll within their own region
- **AND** the archive region stays pinned to the bottom of the panel, reachable without
  scrolling past the folder list

#### Scenario: The archive region is hidden when nothing is archived

- **WHEN** no conversation and no folder is archived
- **THEN** the bottom-docked archive region is not rendered
- **AND** the archived-conversations section appears only once at least one
  platform-visible conversation is archived

### Requirement: Folder state is single-writer and multi-tab consistent

Folder reads and mutations SHALL flow through the service worker as the single writer via the
messaging hub, the worker SHALL persist all durable folder state in the store (surviving worker
restart), and after a mutation it SHALL broadcast a state change so every open subscribed tab
reflects the update. Because broadcast delivery is best-effort, the view that originates a
mutation SHALL NOT rely on the broadcast or the mutation response alone: after every mutation
attempt — whether it resolves successfully or with a transient transport failure — the view
SHALL reconcile by re-reading worker state (observe-don't-replay), since the worker may have
committed the write even when its acknowledgement was lost. The view SHALL NOT replay the
mutation to recover. If, after reconciling, the change is confirmed not to have taken effect,
the failure SHALL be surfaced to the user rather than silently swallowed.

#### Scenario: A folder change reaches other open tabs

- **WHEN** a folder is created, moved, renamed, pinned, archived, or deleted in one tab
- **THEN** the service worker persists the change and broadcasts a state change
- **AND** other subscribed tabs re-render the tree to reflect it

#### Scenario: Folder state survives a reload

- **WHEN** folders and conversation assignments are created and the overlay is reloaded
- **THEN** the rebuilt sidebar shows the same tree, ordering, pins, archives, and counts (D19)

#### Scenario: The UI never writes storage directly

- **WHEN** the sidebar applies any folder change
- **THEN** it does so by sending a mutation message to the worker
- **AND** it does not write IndexedDB from the content script or UI

#### Scenario: A committed mutation with a lost acknowledgement still appears

- **WHEN** the user creates (or otherwise mutates) a folder and the worker commits it but the mutation response and broadcast are missed (e.g. the worker is torn down at the message edge)
- **THEN** the originating view re-reads worker state after the attempt
- **AND** the committed change appears without a remount
- **AND** the mutation is not re-sent

#### Scenario: A mutation that did not take effect is surfaced, not lost

- **WHEN** a mutation attempt fails and a reconciling re-read confirms the change did not take effect
- **THEN** the user is shown that the action failed
- **AND** the user's input is not silently discarded

### Requirement: Folder view distinguishes loading, ready, and error

The folder view SHALL track a load status of `loading`, `ready`, or `error` and SHALL render
accordingly so that a failed or in-flight load is never presented as an empty workspace. When a
read has succeeded and returned no active folders, the folder body SHALL render a slim ghost
create-folder row (not a dedicated "No folders yet" card); folder creation also remains
reachable from the section-header create affordance. A loading indicator SHALL appear only if
the first read has not resolved within a short delay, so a warm read does not flash a spinner. A
read that fails (after the transport's transient-retry budget is exhausted) SHALL show a
"couldn't load" state with a retry action, not the empty state.

#### Scenario: Empty state renders only after a successful read

- **WHEN** the folder view has not yet completed a successful read
- **THEN** it does not render the ghost create-folder row

#### Scenario: Genuinely empty workspace shows the ghost create-folder row

- **WHEN** a read succeeds and returns no active folders
- **THEN** the view renders the slim ghost "+ New folder" row
- **AND** activating it opens the create-folder dialog
- **AND** no dedicated "No folders yet" card is rendered

#### Scenario: Warm read does not flash a loading indicator

- **WHEN** the first read resolves within the short delay threshold
- **THEN** no loading indicator is shown before the tree (or ghost row) renders

#### Scenario: Failed load shows a retry affordance

- **WHEN** the initial read fails after the transient-retry budget is exhausted
- **THEN** the view shows a "couldn't load" state with a retry action
- **AND** invoking retry re-reads worker state and renders the result on success

### Requirement: Uncategorized section is always present

The sidebar SHALL render the Uncategorized (unfiled) section unconditionally in the Folders
tab body — including when it holds no conversations — with its disclosure caret, the
"Uncategorized" label, and a conversation count that reads `0` when empty. The section SHALL
start expanded so its contents (or empty state) are visible on first paint, and SHALL be
included in the "expand all" action. When the section holds no conversations, it SHALL render
a single empty-state message that does not assert the user's authentication state, so the copy
stays correct whether the user is signed out of every platform, signed in with no history yet,
or has every conversation already filed.

#### Scenario: Uncategorized renders with zero unfiled conversations

- **WHEN** a read succeeds and no conversation is unfiled
- **THEN** the Uncategorized section is still rendered with its caret and a count of `0`
- **AND** expanding it shows the empty-state message rather than an empty list

#### Scenario: Uncategorized starts expanded on first paint

- **WHEN** the Folders tab body first renders
- **THEN** the Uncategorized section is expanded
- **AND** its conversations (or, when empty, its empty-state message) are visible without a click

#### Scenario: Empty-state copy is auth-agnostic

- **WHEN** the Uncategorized section renders with no conversations
- **THEN** the empty-state message states that chats will appear once the user chats on a
  supported AI
- **AND** the message makes no claim about whether the user is currently signed in

#### Scenario: Unfiled conversations render when present

- **WHEN** at least one conversation is unfiled
- **THEN** the Uncategorized section lists those conversations with its count matching the rows

### Requirement: Folder dialog defaults to a folder icon and blue colour

The create-folder dialog SHALL open with a **folder icon** and a **blue colour** preselected by
default, so a folder created without further choices is branded rather than blank. The default
folder icon SHALL be a **tintable SVG** stored as a distinct sentinel value (not the empty/"no
icon" state) so a defaulted folder is distinguishable from one the user explicitly cleared; it
SHALL render in the folder's colour. The clear/"no icon" and clear/"no colour" options SHALL remain
available so a user can still opt out. Emoji icons SHALL render as-is (un-tinted).

#### Scenario: New folder dialog preselects folder icon and blue

- **WHEN** the user opens the create-folder dialog
- **THEN** the folder icon option and the blue colour swatch are preselected
- **AND** confirming without changing them creates a folder carrying the folder icon and blue colour

#### Scenario: Default folder icon renders tinted in the folder colour

- **WHEN** a folder uses the default folder icon
- **THEN** the sidebar renders it as the tintable folder SVG in the folder's colour

#### Scenario: Clear options remain available

- **WHEN** the user selects the clear/"no icon" or clear/"no colour" option in the dialog
- **THEN** the folder is created with no icon or no colour respectively
- **AND** a cleared folder is distinguishable from a default-iconed folder

#### Scenario: An emoji icon is not tinted

- **WHEN** a folder uses an emoji icon
- **THEN** the sidebar renders the emoji as-is, without applying the folder colour as a tint

### Requirement: Folder creation respects the tier quota

`folder.create` SHALL be rejected when the current folder count is at or above the active tier's
folder limit, before any record is written, with a `quota_exceeded` error naming `folders`. Counts
exclude tombstoned records. Renames, moves, and deletes are unaffected by the quota.

#### Scenario: Creating a folder over quota is rejected

- **WHEN** the tier is `FREE`, 5 folders exist, and a folder create arrives
- **THEN** the create is rejected with a `quota_exceeded` error for `folders`
- **AND** no folder is persisted

#### Scenario: Moving a folder at quota still works

- **WHEN** the folder count is at the limit
- **THEN** a folder move or rename completes normally
