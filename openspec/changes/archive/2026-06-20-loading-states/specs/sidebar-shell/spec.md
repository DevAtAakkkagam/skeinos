## ADDED Requirements

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
