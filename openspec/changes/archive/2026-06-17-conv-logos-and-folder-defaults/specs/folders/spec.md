## ADDED Requirements

### Requirement: Folder dialog defaults to a folder icon and blue colour

The create-folder dialog SHALL open with a **folder icon** and a **blue colour** preselected by
default, so a folder created without further choices is branded rather than blank. The default
folder icon SHALL be a **tintable SVG** stored as a distinct sentinel value (not the empty/"no
icon" state) so a defaulted folder is distinguishable from one the user explicitly cleared; it
SHALL render in the folder's colour. The clear/"no icon" and clear/"no colour" options SHALL remain
available so a user can still opt out. Emoji icons SHALL render as-is (un-tinted).

#### Scenario: New folder dialog preselects folder icon and blue

- **WHEN** the user opens the create-folder dialog
- **THEN** the folder icon option and the blue colour swatch are preselected
- **AND** confirming without changing them creates a folder carrying the folder icon and blue colour

#### Scenario: Default folder icon renders tinted in the folder colour

- **WHEN** a folder uses the default folder icon
- **THEN** the sidebar renders it as the tintable folder SVG in the folder's colour

#### Scenario: Clear options remain available

- **WHEN** the user selects the clear/"no icon" or clear/"no colour" option in the dialog
- **THEN** the folder is created with no icon or no colour respectively
- **AND** a cleared folder is distinguishable from a default-iconed folder

#### Scenario: An emoji icon is not tinted

- **WHEN** a folder uses an emoji icon
- **THEN** the sidebar renders the emoji as-is, without applying the folder colour as a tint
