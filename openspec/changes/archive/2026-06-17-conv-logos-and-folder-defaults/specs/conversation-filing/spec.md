## MODIFIED Requirements

### Requirement: Conversations list files via picker and same-document drag

The Folders tab SHALL render the active platform's conversations as a list, each row showing the
conversation's **platform brand logo** as its leading mark, the conversation title, and its current
folder, and offering the Move-to-folder picker via a per-row menu. The platform logo SHALL come
from the `platform-branding` registry keyed by the conversation's `platform` and SHALL be the row's
leading affordance (no colour dot). A conversation row SHALL also be draggable onto a folder node
within the same document to assign it, with drag as an enhancement only — every action reachable by
drag SHALL also be reachable via the keyboard-operable picker. The list SHALL be a pure view over
worker state, re-reading on `state.changed`, and SHALL hold no authoritative state of its own.

#### Scenario: A row shows its platform logo

- **WHEN** the list renders a conversation row
- **THEN** the row leads with the brand logo for that conversation's `platform`
- **AND** no per-conversation colour dot is shown

#### Scenario: Filing a list row via its menu

- **WHEN** the user opens a conversation row's menu and chooses a folder in the picker
- **THEN** that conversation is assigned to the chosen folder
- **AND** the row shows the new folder after reconciling

#### Scenario: Dragging a row onto a folder files it

- **WHEN** the user drags a conversation row onto a folder node in the same panel
- **THEN** the conversation is assigned to that folder via `conversation.assign`

#### Scenario: Every filing action has a keyboard path

- **WHEN** a conversation can be filed by dragging it onto a folder
- **THEN** the same assignment is achievable through the row's menu and the keyboard-operable picker without a pointer

#### Scenario: The list reflects external changes

- **WHEN** a conversation's folder changes from another tab or surface
- **THEN** the list re-reads worker state on the `state.changed` broadcast and shows the updated folder

## ADDED Requirements

### Requirement: Conversation row opens by platform-aware routing

Activating a conversation row SHALL open that conversation by routing on its platform relative to
the panel's active-tab platform. When the conversation's `platform` equals the active-tab platform,
the system SHALL navigate the **active tab** (resolving the relative `nativeId` against the active
tab's URL, as today). When the platforms differ, the system SHALL build the absolute conversation
URL from the `platform-branding` origin for the conversation's platform and open it in a
**side-by-side window** at approximately half the screen width; if creating that window is
unavailable or fails for any reason, the system SHALL **fall back to opening a new tab** at the same
URL. Routing SHALL read only the conversation's own metadata and the active tab's URL — never page
content — and SHALL require no additional permissions.

#### Scenario: Same-platform conversation opens in the active tab

- **WHEN** the user activates a conversation whose platform matches the panel's active-tab platform
- **THEN** the active tab navigates to that conversation

#### Scenario: Cross-platform conversation opens side by side

- **WHEN** the user activates a conversation whose platform differs from the active-tab platform
- **THEN** the system resolves its absolute URL from the platform-branding origin
- **AND** opens it in a side-by-side window at roughly half the screen width

#### Scenario: Falls back to a new tab when a side-by-side window cannot be created

- **WHEN** a cross-platform open is requested but window creation is unavailable or fails
- **THEN** the conversation opens in a new tab at the same absolute URL

#### Scenario: Routing reads no page content and adds no permissions

- **WHEN** any conversation is opened
- **THEN** only the conversation's metadata and the active tab's URL are read
- **AND** no host or tabs permission beyond the existing manifest is required
