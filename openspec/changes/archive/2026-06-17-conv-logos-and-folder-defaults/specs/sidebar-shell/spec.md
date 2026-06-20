## MODIFIED Requirements

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
