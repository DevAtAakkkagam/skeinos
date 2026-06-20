# sidebar-shell Specification

## Purpose

The sidebar-shell capability defines the framed shell panel: a header with brand wordmark and
collapse toggle, a tab strip (active Folders tab plus disabled future tabs), a body region
that frames the folder tree, disabled stubs reserving layout for unbuilt features, a
collapsed icon rail, and a footer with a settings gear. It persists its collapsed state via
settings, and is styled exclusively from `--sk-*` theme tokens with full keyboard and ARIA
support. The shell is mounted by the side-panel entrypoint (see the `side-panel` capability).

## Requirements

### Requirement: Framed sidebar shell

The system SHALL render the sidebar as a framed panel in the shadow-DOM overlay
comprising a header (brand wordmark, workspace label, and a collapse toggle), a tab
strip, a body region, and a footer — all styled only from `--sk-*` theme tokens, with
no hard-coded colors or user-facing string literals in markup, and every interactive
element keyboard-operable and ARIA-labelled.

#### Scenario: Shell frames the folder body

- **WHEN** the sidebar mounts in its expanded state
- **THEN** the header, tab strip, footer, and a body region are rendered
- **AND** the active folder tree is rendered inside the body under the Folders tab

#### Scenario: Chrome is token-styled and accessible

- **WHEN** the shell renders any control
- **THEN** the control draws its colors from `--sk-*` tokens
- **AND** carries an accessible label
- **AND** is reachable and operable by keyboard

### Requirement: Tab strip with active Folders tab and disabled future tabs

The shell SHALL present a tab strip with Folders, Prompts, and Profiles tabs. Folders and Prompts SHALL
be **interactive**: activating a tab switches the body region to that tab's content and updates the
selected/`aria-selected` state, with Folders selected on first render. The Folders tab SHALL select the
folder body (with its platform-filter and collapsed-list chrome); the Prompts tab SHALL select the prompt
library body. The Profiles tab SHALL remain a disabled "coming soon" control that dispatches no action
until its feature ships.

#### Scenario: Folders tab is active by default

- **WHEN** the shell renders
- **THEN** the Folders tab is shown as selected
- **AND** the folder body is visible

#### Scenario: Switching to the Prompts tab

- **WHEN** the user activates the Prompts tab
- **THEN** the Prompts tab becomes selected (`aria-selected`)
- **AND** the prompt library body is shown in place of the folder body
- **AND** the folder-specific platform-filter row and collapsed-list nudge are not shown

#### Scenario: Switching back to Folders

- **WHEN** the user activates the Folders tab after viewing Prompts
- **THEN** the folder body and its platform-filter chrome are shown again

#### Scenario: Profiles tab stays inert

- **WHEN** the user activates the Profiles tab
- **THEN** the control is marked disabled / `aria-disabled`
- **AND** no tab switch or other action occurs

### Requirement: Disabled stubs reserve layout for unbuilt features

The shell SHALL render the search launcher (with a ⌘K hint), the tag filter row, the
tier (PRO) badge, and the sync-status indicator as visually-present but disabled
elements that dispatch no action, reserving their layout slots for the search, tags,
tier, and sync features respectively.

#### Scenario: Search launcher is an inert stub

- **WHEN** the shell renders the search launcher
- **THEN** the launcher and its ⌘K hint are shown
- **AND** the launcher is disabled and triggers nothing when activated

#### Scenario: Tier and sync indicators are inert stubs

- **WHEN** the shell renders the footer
- **THEN** the PRO badge and sync-status indicator are shown
- **AND** neither dispatches an action when activated

### Requirement: Platform view-filter control

The shell SHALL render a platform view-filter as a chip group within the filter area
(alongside the tag-filter row). It SHALL offer an "All" chip (active by default) plus a
chip for each platform present in the workspace, and selecting a chip SHALL narrow the
rendered conversation list to that platform while "All" restores the unified view. Each
platform chip SHALL render that platform's **brand logo** (from the `platform-branding` registry)
before its label; the "All" chip SHALL remain neutral (no single brand logo). The control SHALL be
token-styled and fully keyboard-operable with an accessible group label, consistent with the rest
of the chrome.

#### Scenario: Filter defaults to All

- **WHEN** the shell renders
- **THEN** the "All" chip is active and the conversation list is unified across platforms

#### Scenario: Platform chips show their brand logo

- **WHEN** the shell renders a chip for a platform present in the workspace
- **THEN** the chip shows that platform's brand logo before its label
- **AND** the "All" chip shows no brand logo

#### Scenario: Selecting a platform chip narrows the list

- **WHEN** the user activates a platform chip
- **THEN** the rendered conversation list and counts narrow to that platform
- **AND** activating "All" restores the unified view

#### Scenario: Platform filter is keyboard-operable and labelled

- **WHEN** a keyboard user navigates the filter chip group
- **THEN** each chip is focusable and activatable from the keyboard
- **AND** the group exposes an accessible label

### Requirement: Collapse toggle with persisted state

The shell SHALL provide a collapse toggle that switches between the expanded panel and
a collapsed icon-only rail, and SHALL persist the collapsed state via the settings store
so it survives a reload, restoring the same mode on next mount.

#### Scenario: Toggling to collapsed shows the rail

- **WHEN** the user activates the collapse toggle from the expanded panel
- **THEN** the collapsed icon rail is rendered in place of the expanded body
- **AND** the collapsed state is written to settings

#### Scenario: Collapsed state survives a reload

- **WHEN** the sidebar is collapsed and the overlay is reloaded
- **THEN** the rebuilt sidebar mounts in the collapsed rail state

#### Scenario: Expanding from the rail restores the panel

- **WHEN** the user activates the toggle from the collapsed rail
- **THEN** the expanded panel is rendered
- **AND** the expanded state is persisted

### Requirement: Collapsed icon rail

The collapsed rail SHALL render an icon-only column with entries for the app, search,
folders, prompts, profiles, sync, and settings. Entries for unbuilt features SHALL be
inert; the folders and settings entries SHALL be operable.

#### Scenario: Rail settings icon opens the options page

- **WHEN** the user activates the settings entry on the collapsed rail
- **THEN** the extension options page is opened

#### Scenario: Rail future-feature icons are inert

- **WHEN** the user activates the search, prompts, profiles, or sync icon on the rail
- **THEN** no action is dispatched

### Requirement: Footer settings gear opens the options page

The footer SHALL include a settings gear that opens the extension options page via the
runtime API, requiring no additional permissions.

#### Scenario: Gear opens options

- **WHEN** the user activates the footer settings gear
- **THEN** the extension options page is opened

### Requirement: Empty-state card

When there are no active folders, the folder body SHALL render an empty-state card
containing a folder glyph, explanatory copy, and a "New folder" call to action that
opens the existing create-folder dialog.

#### Scenario: Empty state offers folder creation

- **WHEN** the folder body renders with no active folders
- **THEN** the empty-state card with a "New folder" call to action is shown
- **AND** activating it opens the create-folder dialog

### Requirement: Skeleton loaders while the workspace is loading

The sidebar body SHALL render skeleton loaders in place of the folder/conversation list while the
workspace folder tree has not yet resolved (the load status is loading), rather than a blank
surface or the empty-state card. The empty-state card SHALL appear only once the workspace has
resolved with no folders, and skeleton loaders SHALL NOT remain after the tree resolves.

#### Scenario: Loading shows skeletons, not blank or empty

- **WHEN** the sidebar body renders while the workspace load status is loading
- **THEN** skeleton loaders are shown
- **AND** the empty-state card is not shown

#### Scenario: Resolved-empty shows the empty-state card, not skeletons

- **WHEN** the workspace resolves with no active folders
- **THEN** the empty-state card is shown
- **AND** no skeleton loaders are shown

### Requirement: Non-blocking indexing indicator

The sidebar shell SHALL show a non-blocking indicator while background conversation indexing is in
progress, driven by the `index.progress` broadcast. The indicator SHALL report the number of
conversations being indexed and the completion percentage derived from the broadcast's `done` and
`total`, SHALL NOT block interaction with the rest of the panel, and SHALL dismiss itself when
indexing completes (`done` reaches `total`).

#### Scenario: Indicator appears with count and percent during indexing

- **WHEN** an `index.progress` broadcast arrives with `total` greater than zero and `done` less
  than `total`
- **THEN** the shell shows the indexing indicator reporting the count and the percent complete
- **AND** the rest of the panel remains interactive

#### Scenario: Indicator dismisses on completion

- **WHEN** indexing reaches completion (`done` equals `total`)
- **THEN** the indexing indicator is dismissed

#### Scenario: No indicator when nothing is indexing

- **WHEN** no indexing is in progress (no in-flight `index.progress`, or `total` is zero)
- **THEN** the indexing indicator is not shown
