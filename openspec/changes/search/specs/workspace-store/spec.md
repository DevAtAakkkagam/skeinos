## MODIFIED Requirements

### Requirement: Versioned schema with explicit migrations

The store SHALL define one versioned IndexedDB database whose object stores and indexes match the data model, and SHALL apply schema changes through an explicit, ordered, add-only migration list. The `searchPostings` store SHALL be keyed by `prefix` (prefix-shard layout per LLD §8.1 / D26), each record holding many terms.

#### Scenario: All declared stores and indexes exist at the current version

- **WHEN** the database is opened at the current version
- **THEN** every declared object store exists with its declared key path and indexes
- **AND** the `searchPostings` store (keyed by `prefix`) and the `syncMeta` store are present

#### Scenario: Migration upgrades an older database

- **WHEN** a database created at version 1 is opened at version 2
- **THEN** the version-2 migration runs and the resulting schema includes the version-2 additions
- **AND** existing version-1 records remain readable

#### Scenario: searchPostings reshape is a no-data migration

- **WHEN** the migration that changes `searchPostings` from the per-term layout (keyed by `term`) to the prefix-shard layout (keyed by `prefix`) runs
- **THEN** the `searchPostings` store is recreated with key path `prefix`
- **AND** no posting rows require transformation because indexing has not yet run
- **AND** all other stores and their records are unaffected
