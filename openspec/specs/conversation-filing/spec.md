# conversation-filing Specification

## Purpose

The conversation-filing capability defines how a conversation is filed into a folder across the extension's surfaces. It centers on a keyboard-first Move-to-folder picker as the single filing primitive, surfaces the active tab's conversation as a current-conversation card, persists the active conversation through a single-writer, worker-death-durable seam that carries only id/title metadata, and renders the Folders-tab conversations list as a pure view that files via the picker and same-document drag. Every filing action has a keyboard path, and conversation content never crosses the active-conversation seam.

## Requirements

### Requirement: Move-to-folder picker is the keyboard-first filing primitive

The system SHALL provide a "Move to folder" picker that lists the active platform's non-archived
folders as a type-to-filter list, lets the user choose one with the keyboard alone, and resolves the
choice to a single `conversation.assign` for the target conversation. When the conversation is already
filed, the picker SHALL offer an explicit "Remove from folder" choice that assigns `folderId: null`.
The picker SHALL be fully keyboard-operable and ARIA-labelled, style only from `--sk-*` tokens, and use
no hard-coded user-facing strings.

#### Scenario: Filtering and choosing a folder files the conversation

- **WHEN** the user opens the picker for a conversation, types to filter the folder list, and confirms a folder with the keyboard
- **THEN** the conversation is assigned to that folder via `conversation.assign`
- **AND** the picker closes and the view reflects the new folder after reconciling

#### Scenario: Unfiling is offered only when already filed

- **WHEN** the picker is opened for a conversation that is currently in a folder
- **THEN** a "Remove from folder" choice is presented
- **AND** choosing it assigns `folderId: null`

#### Scenario: Picker is operable without a pointer

- **WHEN** the user opens the picker and navigates with arrow keys, Enter to confirm, and Esc to dismiss
- **THEN** a folder can be chosen and the picker dismissed without any pointer interaction
- **AND** the input, options, and selection carry ARIA roles and labels

### Requirement: Current-conversation card files the active tab's conversation

The side panel SHALL surface the conversation open in the active tab as a current-conversation card
showing its title and current folder, with a single affordance that opens the Move-to-folder picker
for that conversation. The card SHALL reflect the active tab's resolved platform and SHALL render a
neutral state (not an error) when no conversation is active.

#### Scenario: Filing the current conversation from the card

- **WHEN** a conversation is open in the active tab and the user activates the card's "Add to folder" affordance and chooses a folder
- **THEN** the active conversation is assigned to that folder
- **AND** the card shows the new folder after reconciling

#### Scenario: No active conversation shows a neutral state

- **WHEN** the active tab has no resolvable conversation
- **THEN** the card renders a neutral empty state rather than an error or a stale conversation

### Requirement: Active-conversation seam is single-writer and durable

The content script SHALL report the active tab's conversation (id and title only, via the adapter's
`detectConversation()`) to the service worker on load and on in-page navigation, the worker SHALL
persist one active-conversation record per platform so the value survives worker death, and the panel
SHALL read it through a `conversation.active` query scoped to its resolved platform. Conversation
content SHALL NOT cross this seam — only the existing id/title metadata.

#### Scenario: Active conversation survives worker restart

- **WHEN** the content script reports the active conversation and the worker is later torn down and rehydrated
- **THEN** the panel's `conversation.active` query still returns the last reported conversation for that platform

#### Scenario: In-page navigation updates the active conversation

- **WHEN** the user navigates to a different conversation within the host site without a full reload
- **THEN** the content script reports the new active conversation
- **AND** the panel reflects it after reconciling on the next `state.changed`, focus, or visibility

#### Scenario: Only metadata crosses the seam

- **WHEN** the active conversation is reported
- **THEN** only its id and title are sent
- **AND** no conversation message content is transmitted or stored for this seam

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
