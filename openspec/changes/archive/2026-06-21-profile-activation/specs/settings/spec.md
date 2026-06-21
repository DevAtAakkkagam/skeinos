## ADDED Requirements

### Requirement: Active instruction profile preference

The settings schema SHALL include an optional `activeProfileId` recording the globally active
instruction profile. It SHALL be additive — a stored settings object missing the key SHALL fall
back to undefined (no active profile) without invalidating the install — SHALL be read and written
through the existing settings accessors, and SHALL be device-local (it is not part of the synced
set).

#### Scenario: Default on a fresh install

- **WHEN** settings are read with nothing previously stored
- **THEN** `activeProfileId` is undefined

#### Scenario: Written value persists and round-trips

- **WHEN** `activeProfileId` is set to a profile id
- **AND** settings are read back
- **THEN** `activeProfileId` is that profile id

#### Scenario: A change notifies open surfaces

- **WHEN** `activeProfileId` is changed
- **THEN** subscribed surfaces are notified with the updated settings
