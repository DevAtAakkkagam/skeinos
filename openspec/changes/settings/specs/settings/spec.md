## ADDED Requirements

### Requirement: Settings persisted in chrome.storage.local

The extension SHALL store user settings in `chrome.storage.local` under a typed schema, and SHALL NOT use IndexedDB for settings.

#### Scenario: A changed setting persists across reloads

- **WHEN** a setting is written via the settings accessor
- **AND** the extension context is reloaded
- **THEN** reading settings returns the written value

### Requirement: Privacy-first defaults

On first run with no stored settings, reading settings SHALL return defaults that have telemetry disabled and theme set to system.

#### Scenario: Defaults on a fresh install

- **WHEN** settings are read with nothing previously stored
- **THEN** `telemetry` is off
- **AND** `theme` is `system`

#### Scenario: Stored values override defaults while missing keys fall back

- **WHEN** only some settings keys have stored values
- **THEN** reading returns the stored values for those keys
- **AND** returns defaults for the remaining keys

### Requirement: Live settings change notification

The settings module SHALL provide a subscription that fires when settings change, so open UI surfaces can update without a reload.

#### Scenario: Subscriber is notified on change

- **WHEN** a subscriber is registered
- **AND** a setting is written
- **THEN** the subscriber is invoked with the updated settings

### Requirement: Options page reads and persists settings

The extension SHALL provide an options page that opens, displays current settings, and persists changes.

#### Scenario: Options page persists a theme change

- **WHEN** the options page is opened and the theme is changed
- **THEN** the new theme is stored
- **AND** reopening the options page shows the changed theme
