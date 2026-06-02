## ADDED Requirements

### Requirement: Panel docks outboard on the right and reflows the host

The panel SHALL dock as a fixed, full-height container on the right edge of the
viewport, independent of the host page's own DOM and sidebar, and SHALL reflow the
host page left by the panel width so the two rails never overlap. Removing the panel
SHALL restore the host's original layout.

#### Scenario: Panel mounts on the right, independent of the host

- **WHEN** the overlay mounts on a supported host
- **THEN** the panel is a fixed container on the right edge of the viewport
- **AND** it is not nested inside the host's own navigation or sidebar

#### Scenario: The host page reflows left to make room

- **WHEN** the panel is docked
- **THEN** the host page is reflowed left by the panel width
- **AND** when the panel is removed the host's original layout is restored

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

The shell SHALL present a tab strip with Folders, Prompts, and Profiles tabs. The
Folders tab SHALL be active and select the folder body. The Prompts and Profiles tabs
SHALL render as disabled "coming soon" controls that dispatch no action until their
features ship.

#### Scenario: Folders tab is active

- **WHEN** the shell renders
- **THEN** the Folders tab is shown as selected
- **AND** the folder body is visible

#### Scenario: Future tabs are inert

- **WHEN** the user activates the Prompts or Profiles tab
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
