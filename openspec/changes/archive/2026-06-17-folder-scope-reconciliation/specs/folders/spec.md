## ADDED Requirements

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

## MODIFIED Requirements

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
