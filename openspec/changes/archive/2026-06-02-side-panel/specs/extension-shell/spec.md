## ADDED Requirements

### Requirement: Side panel registered with minimum permission

The extension SHALL register a side-panel page in its manifest and request the
`sidePanel` permission, adding no host access. Any additional permission needed to
scope the panel to the active tab (e.g. reading the active tab's URL) SHALL be the
minimum required and justified, consistent with the privacy-first posture.

#### Scenario: Manifest declares the side panel and permission

- **WHEN** the built manifest is inspected
- **THEN** it declares a side-panel page path
- **AND** it lists the `sidePanel` permission
- **AND** it grants no new host permissions for the side panel
