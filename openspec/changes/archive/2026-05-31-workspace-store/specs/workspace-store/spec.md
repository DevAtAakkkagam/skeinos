## ADDED Requirements

### Requirement: Typed repository CRUD

The store SHALL expose a typed `Repo<T>` per workspace store providing `get`, `put`, `delete`, and `query` operations over a single versioned IndexedDB database, and feature code SHALL access persistence only through these repositories.

#### Scenario: Put then get round-trips a record

- **WHEN** a record is written via `Repo.put` and then read via `Repo.get` by its id
- **THEN** the returned record equals the written record, including its envelope fields

#### Scenario: Query by index returns matching records

- **WHEN** multiple records are stored and queried via `Repo.query` on a defined index with a key range
- **THEN** only the records whose indexed value falls in the range are returned

### Requirement: Sync envelope on every write

Every `put` of a syncable record SHALL stamp the sync envelope: increment `rev`, set `updatedAt` and `deviceId`, and recompute `hash`.

#### Scenario: First write initializes the envelope

- **WHEN** a new syncable record is put
- **THEN** it is stored with `rev` equal to 1, a numeric `updatedAt`, a non-empty `deviceId`, and a non-empty `hash`

#### Scenario: Subsequent write bumps rev and refreshes metadata

- **WHEN** an existing syncable record is put again with changed content
- **THEN** its `rev` increases
- **AND** `updatedAt` is refreshed and `hash` reflects the new content

### Requirement: Deletes write tombstones for syncable records

Deleting a syncable record SHALL mark it `deleted: true` and retain it as a tombstone rather than removing the row, so the deletion can later propagate via sync.

#### Scenario: Delete tombstones rather than removes

- **WHEN** a syncable record is deleted via `Repo.delete`
- **THEN** a row with the same id remains with `deleted: true` and a bumped `rev`
- **AND** `Repo.get` treats the record as absent for normal reads

### Requirement: Versioned schema with explicit migrations

The store SHALL define one versioned IndexedDB database whose object stores and indexes match the data model, and SHALL apply schema changes through an explicit, ordered, add-only migration list.

#### Scenario: All declared stores and indexes exist at the current version

- **WHEN** the database is opened at the current version
- **THEN** every declared object store exists with its declared key path and indexes
- **AND** the `searchPostings` store (keyed by `term`) and the `syncMeta` store are present

#### Scenario: Migration upgrades an older database

- **WHEN** a database created at version 1 is opened at version 2
- **THEN** the version-2 migration runs and the resulting schema includes the version-2 additions
- **AND** existing version-1 records remain readable

### Requirement: Multi-store atomic transactions

The store SHALL provide a `tx` operation that runs a function across multiple object stores in a single transaction, committing all writes or none.

#### Scenario: A failing transaction rolls back

- **WHEN** a `tx` over two stores writes to the first store and then throws before completing
- **THEN** neither store reflects a partial write

### Requirement: Local-only stores are excluded from sync

The store SHALL classify `conversations`, `searchPostings`, and `comparisons` as local-only and exclude them from the set of stores eligible for sync.

#### Scenario: Local-only stores are excluded from the syncable set

- **WHEN** the set of syncable stores is enumerated
- **THEN** it includes `folders`, `prompts`, `promptFolders`, `profiles`, and `tags`
- **AND** it excludes `conversations`, `searchPostings`, and `comparisons`
