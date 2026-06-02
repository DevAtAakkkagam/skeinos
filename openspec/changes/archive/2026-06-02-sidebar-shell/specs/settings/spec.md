## ADDED Requirements

### Requirement: Sidebar collapse preference

The settings schema SHALL include an optional `sidebarCollapsed` boolean UI preference
that defaults to `false`. It SHALL be additive — a stored settings object missing the
key SHALL fall back to the default without invalidating the install — and SHALL be read
and written through the existing settings accessors.

#### Scenario: Default on a fresh install

- **WHEN** settings are read on a fresh install
- **THEN** `sidebarCollapsed` is `false`

#### Scenario: Stored collapse state persists across reloads

- **WHEN** `sidebarCollapsed` is set to `true` and settings are re-read after a reload
- **THEN** the read value is `true`

#### Scenario: Missing key falls back to the default

- **WHEN** a stored settings object does not contain `sidebarCollapsed`
- **THEN** reading settings returns `sidebarCollapsed` as `false`
- **AND** other stored values are preserved
