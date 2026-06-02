# settings Specification

## Purpose

The settings capability defines the `chrome.storage.local`-backed user-preferences store for the extension: a typed `Settings` schema with privacy-first defaults (telemetry off, theme = system), typed read/write accessors, a change subscription so open UI surfaces update live, and the options-page entry that reads and persists those settings. It is deliberately independent of IndexedDB and the workspace store (D4).

## Requirements

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
