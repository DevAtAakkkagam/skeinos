## ADDED Requirements

### Requirement: Profile library read

The system SHALL expose a `profiles.query` request that returns the full instruction-profile
library from the synced `profiles` store, excluding tombstones. Each returned profile SHALL carry
its name, optional description, instruction text, the platforms it applies to, and its optional
response style.

#### Scenario: Reading the profile library

- **WHEN** a `profiles.query` for the library is handled
- **THEN** all non-tombstoned profiles are returned with their name, instruction text, `appliesTo`
  platforms, and response style

### Requirement: Profile mutations run in the single writer and broadcast on change

Profile create, update, and delete SHALL be performed only by the service worker via a
`profiles.mutate` request, each `put` stamping the sync envelope and each delete writing a
tombstone. A successful mutation SHALL broadcast a `state.changed` naming the `profiles` store so
open surfaces reconcile.

#### Scenario: Creating a profile

- **WHEN** a `profiles.mutate` create op is handled with a name and instruction text
- **THEN** a new profile is stored with the sync envelope stamped
- **AND** a `state.changed` broadcast naming `profiles` is emitted

#### Scenario: Updating a profile is a partial patch

- **WHEN** a `profiles.mutate` update op changes a subset of fields (e.g. instruction text or
  `appliesTo`)
- **THEN** only those fields change and the rest are preserved
- **AND** the sync envelope is re-stamped and a `state.changed` for `profiles` is emitted

#### Scenario: Deleting a profile writes a tombstone

- **WHEN** a `profiles.mutate` delete op is handled
- **THEN** the profile is removed from subsequent library reads and a tombstone is written
- **AND** a `state.changed` for `profiles` is emitted

### Requirement: Profile library view with editor

The extension SHALL provide a Profiles view listing saved profiles and an editor for the selected
profile. The editor SHALL let the user set the name, description, instruction text, the platforms
the profile applies to, and the response style (verbosity and format). The view SHALL allow
creating a new profile and deleting an existing one, and SHALL be a pure view over the worker
(reflecting changes via the `profiles` broadcast without local replay).

#### Scenario: Creating and editing a profile

- **WHEN** the user creates a profile and edits its name, instruction text, `appliesTo` platforms,
  and response style
- **THEN** the changes are persisted through the worker
- **AND** the view reflects them after the worker broadcasts the change

#### Scenario: Deleting a profile from the view

- **WHEN** the user deletes a profile in the view
- **THEN** it is removed through the worker and disappears from the list

### Requirement: Domain-based profile seeding

The system SHALL install a bundled per-domain set of starter instruction profiles when a domain is
chosen during onboarding, via a worker `profiles.install` request handled in the single writer. The
install SHALL be idempotent — deduplicated by each seed's stable `seedId` — so re-installing a
domain, or installing a second domain, never duplicates, and hand-created profiles (which carry no
`seedId`) are never touched. Seeded profiles SHALL be ordinary, editable records carrying the sync
envelope plus `domain`/`seedId` provenance. This is seeding only: no activation or injection.

#### Scenario: Seeding a domain's starter profiles

- **WHEN** a `profiles.install` request for a domain is handled and that domain's seeds are not yet
  present
- **THEN** the domain's starter profiles are stored as editable records carrying their `seedId` and
  `domain`, the sync envelope is stamped, and the inserted count is returned
- **AND** a `state.changed` broadcast naming `profiles` is emitted

#### Scenario: Re-installing a domain is a no-op

- **WHEN** a `profiles.install` request is handled for a domain whose seeds are all already present
- **THEN** no new profiles are stored, the returned count is 0, and no `state.changed` is broadcast

### Requirement: Per-platform mode indicator reflects implemented behavior

The editor SHALL show, for each platform a profile applies to, the injection mode that will
actually be performed. Until system-prompt injection is implemented, this indicator SHALL show
PREPEND for every platform and SHALL NOT advertise a system-prompt mode.

#### Scenario: Mode indicator shows PREPEND for all platforms

- **WHEN** the editor displays the per-platform apply-to rows
- **THEN** each applicable platform shows the PREPEND mode
- **AND** no platform is shown as using a system-prompt mode
