## ADDED Requirements

### Requirement: Folder creation respects the tier quota

`folder.create` SHALL be rejected when the current folder count is at or above the active tier's
folder limit, before any record is written, with a `quota_exceeded` error naming `folders`. Counts
exclude tombstoned records. Renames, moves, and deletes are unaffected by the quota.

#### Scenario: Creating a folder over quota is rejected

- **WHEN** the tier is `FREE`, 5 folders exist, and a folder create arrives
- **THEN** the create is rejected with a `quota_exceeded` error for `folders`
- **AND** no folder is persisted

#### Scenario: Moving a folder at quota still works

- **WHEN** the folder count is at the limit
- **THEN** a folder move or rename completes normally
