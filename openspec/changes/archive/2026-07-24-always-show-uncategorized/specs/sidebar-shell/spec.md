## MODIFIED Requirements

### Requirement: Empty-state card

When there are no active folders, the folder body SHALL render a slim ghost create-folder row
(a "+ New folder" affordance) rather than a dedicated empty-state card. Activating the row SHALL
open the existing create-folder dialog. The first-run explanatory copy that previously lived in
the empty-state card SHALL instead be carried by the always-present Uncategorized section, so
folder creation is offered without pitching empty folders as the primary first action.

#### Scenario: Empty state offers folder creation via the ghost row

- **WHEN** the folder body renders with no active folders
- **THEN** the slim ghost "+ New folder" row is shown
- **AND** activating it opens the create-folder dialog
- **AND** no dedicated "No folders yet" card is rendered
