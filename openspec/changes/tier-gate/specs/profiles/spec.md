## ADDED Requirements

### Requirement: Profile creation respects the tier quota

`profile.create` SHALL be rejected when the current profile count is at or above the active tier's
profile limit, before any record is written, with a `quota_exceeded` error naming `profiles`. Counts
exclude tombstoned records. Editing, activating, and deleting profiles are unaffected by the quota.

#### Scenario: Creating a profile over quota is rejected

- **WHEN** the tier is `FREE`, 3 profiles exist, and a profile create arrives
- **THEN** the create is rejected with a `quota_exceeded` error for `profiles`
- **AND** no profile is persisted

#### Scenario: Activating a profile at quota still works

- **WHEN** the profile count is at the limit
- **THEN** activating or editing an existing profile completes normally
