## MODIFIED Requirements

### Requirement: Tab strip with active Folders tab and disabled future tabs

The shell SHALL present a tab strip with Folders, Prompts, and Profiles tabs, all three
**interactive**: activating a tab switches the body region to that tab's content and updates the
selected/`aria-selected` state, with Folders selected on first render. The Folders tab SHALL select
the folder body (with its platform-filter and collapsed-list chrome); the Prompts tab SHALL select
the prompt library body; the Profiles tab SHALL select the Profiles view. The folder-specific
platform-filter row and collapsed-list nudge SHALL be shown only on the Folders tab.

#### Scenario: Folders tab is active by default

- **WHEN** the shell renders
- **THEN** the Folders tab is shown as selected
- **AND** the folder body is visible

#### Scenario: Switching to the Prompts tab

- **WHEN** the user activates the Prompts tab
- **THEN** the Prompts tab becomes selected (`aria-selected`)
- **AND** the prompt library body is shown in place of the folder body
- **AND** the folder-specific platform-filter row and collapsed-list nudge are not shown

#### Scenario: Switching to the Profiles tab

- **WHEN** the user activates the Profiles tab
- **THEN** the Profiles tab becomes selected (`aria-selected`)
- **AND** the Profiles view is shown in place of the folder body
- **AND** the folder-specific platform-filter row and collapsed-list nudge are not shown

#### Scenario: Switching back to Folders

- **WHEN** the user activates the Folders tab after viewing another tab
- **THEN** the folder body and its platform-filter chrome are shown again
