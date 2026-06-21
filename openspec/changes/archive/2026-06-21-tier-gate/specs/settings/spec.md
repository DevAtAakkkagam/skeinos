## ADDED Requirements

### Requirement: Persisted tier setting

The settings record SHALL include a `tier` field whose value is `FREE` or `PRO`, defaulting to
`FREE` when absent. Reading settings SHALL fill the default for older records that predate the
field, and the value SHALL be observable by the existing settings-change subscription.

#### Scenario: Default fills for records without a tier

- **WHEN** stored settings have no `tier` key
- **THEN** `getSettings()` returns `tier: 'FREE'`

#### Scenario: Tier change notifies subscribers

- **WHEN** the `tier` setting is updated
- **THEN** settings-change subscribers fire with the new value
