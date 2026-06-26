## ADDED Requirements

### Requirement: Diagnostics consent flag
Settings SHALL include a diagnostics telemetry consent flag, `diagnosticsOptIn`, persisted in
`chrome.storage.local`. It SHALL default to **off**. It SHALL be readable by the service worker before any
telemetry egress and SHALL be togglable from the options page.

#### Scenario: Default is off
- **WHEN** settings are read on a fresh install
- **THEN** `diagnosticsOptIn` is off

#### Scenario: Flag persists across reloads
- **WHEN** a user changes the consent flag and the extension reloads
- **THEN** the flag reads as the chosen value after reload

#### Scenario: Live change notification reaches the worker
- **WHEN** the consent flag is changed on the options page
- **THEN** the worker observes the change before it gates the next event
