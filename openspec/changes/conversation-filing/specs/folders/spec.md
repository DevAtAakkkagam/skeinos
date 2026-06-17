## MODIFIED Requirements

### Requirement: Sidebar tree with drag-drop and context menu

The system SHALL render the folder tree as the body of the Folders tab in the shadow-DOM
overlay sidebar, with pinned and archive sections that — like the active tree — show each
folder's icon, color, and conversation count, and SHALL let the user create and edit a
folder via a dialog, drag a folder onto another to re-parent it, drag to reorder folders,
and act on a folder via a right-click context menu (move, pin, archive, rename, delete),
with all UI styled from theme tokens and keyboard-operable. The sidebar SHALL also render the
active platform's conversations and their filing affordances: a folder node SHALL accept a
conversation dropped onto it from the panel's own conversation list as an assignment within the
same document. (Conversations are filed through the keyboard-first Move-to-folder picker defined by
the `conversation-filing` capability; same-document drag is an enhancement, never the only path.)

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
