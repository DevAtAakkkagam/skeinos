## MODIFIED Requirements

### Requirement: Versioned schema with explicit migrations

The store SHALL define one versioned IndexedDB database whose object stores and indexes match the data model, and SHALL apply schema changes through an explicit, ordered, add-only migration list. The `searchPostings` store SHALL be keyed by `prefix` (prefix-shard layout per D26), each record holding many terms. Additive optional `Prompt` fields (`domain`, `seedId`) SHALL be introduced by an appended no-op version step that records the bump without rewriting existing `prompts` rows.

#### Scenario: All declared stores and indexes exist at the current version

- **WHEN** the database is opened at the current version
- **THEN** every declared object store exists with its declared key path and indexes
- **AND** the `searchPostings` store (keyed by `prefix`) and the `syncMeta` store are present

#### Scenario: Migration upgrades an older database

- **WHEN** a database created at version 1 is opened at version 2
- **THEN** the version-2 migration runs and the resulting schema includes the version-2 additions
- **AND** existing version-1 records remain readable

#### Scenario: searchPostings reshape is a no-data migration

- **WHEN** the new migration step — appended to the add-only list after the existing `activeConversations` and conversation-organization steps — changes `searchPostings` from the per-term layout (keyed by `term`) to the prefix-shard layout (keyed by `prefix`)
- **THEN** the `searchPostings` store is dropped and recreated with key path `prefix` at the bumped database version
- **AND** no posting rows require transformation because indexing has not yet run
- **AND** all other stores (including `conversations` and `activeConversations`) and their records are unaffected

#### Scenario: Prompt domain/seedId additions are a no-data migration

- **WHEN** a new version step is appended to the add-only list for the optional `Prompt.domain` and `Prompt.seedId` fields
- **THEN** the step is a no-op that bumps the database version without altering any object store or rewriting any `prompts` row
- **AND** existing `prompts` records remain readable with both new fields read as `undefined`
