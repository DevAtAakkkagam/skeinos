## ADDED Requirements

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

### Requirement: Folder conversation counts

The system SHALL expose, for each folder, a count of the conversations assigned to it, derived from
current conversation data rather than a stored counter, so counts stay correct after assignment,
move, and archive.

#### Scenario: Count reflects current assignments

- **WHEN** conversations are assigned to and removed from a folder
- **THEN** the folder's reported count equals the number of conversations currently assigned to it

### Requirement: Sidebar tree with drag-drop and context menu

The system SHALL render the folder tree in the shadow-DOM overlay sidebar with pinned and archive
sections and per-folder counts, and SHALL let the user create and edit a folder via a dialog, drag a
conversation into a folder, drag to reorder folders, and act on a folder or conversation via a
right-click context menu (move, pin, archive, rename, delete), with all UI styled from theme tokens
and keyboard-operable.

#### Scenario: Dragging a conversation into a folder assigns it

- **WHEN** the user drags a conversation onto a folder in the sidebar
- **THEN** the conversation is assigned to that folder
- **AND** the folder's count updates to include it

#### Scenario: Creating a folder via the dialog adds it to the tree

- **WHEN** the user opens the create-folder dialog, enters a name (and optional color/icon), and confirms
- **THEN** a new folder with those properties appears in the tree

#### Scenario: Context-menu actions mutate the target

- **WHEN** the user invokes move, pin, archive, rename, or delete from the right-click context menu
- **THEN** the corresponding mutation is applied to the targeted folder or conversation

#### Scenario: A rejected drag does not change the tree

- **WHEN** a drag would violate the depth limit or create a cycle
- **THEN** the operation is rejected
- **AND** the sidebar restores the item to its original position

### Requirement: Folder state is single-writer and multi-tab consistent

Folder reads and mutations SHALL flow through the service worker as the single writer via the
messaging hub, the worker SHALL persist all durable folder state in the store (surviving worker
restart), and after a mutation it SHALL broadcast a state change so every open subscribed tab
reflects the update.

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
