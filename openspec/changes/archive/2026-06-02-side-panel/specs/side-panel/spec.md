## ADDED Requirements

### Requirement: Workspace UI hosted in the browser side panel

The system SHALL host the workspace UI (the sidebar shell and folder tree) in the
browser's native side panel as an extension page, rendered with the shared mount
harness and theme, and kept in sync with the service worker through the same request /
broadcast messaging the rest of the UI uses. The side panel SHALL NOT be injected into
the host page.

#### Scenario: Side panel renders the workspace shell

- **WHEN** the side panel page loads
- **THEN** it mounts the sidebar shell as an extension page
- **AND** it reads workspace state from the service worker and re-renders on broadcasts

#### Scenario: Workspace UI is not injected into the host page

- **WHEN** a supported host page is open with the panel available
- **THEN** no workspace UI is added to the host page's DOM by the content script

### Requirement: Panel opens from the toolbar action on supported hosts

The system SHALL open the side panel when the user clicks the extension's toolbar
action, and SHALL enable the panel only on supported P0 host tabs, disabling it on
unsupported tabs. The open behavior SHALL be registered at service-worker load so it
survives cold starts.

#### Scenario: Toolbar click opens the panel

- **WHEN** the user clicks the extension toolbar action on a supported host tab
- **THEN** the side panel opens showing the workspace UI

#### Scenario: Panel is disabled on unsupported tabs

- **WHEN** the active tab is not a supported host
- **THEN** the side panel is disabled for that tab

### Requirement: Panel scopes to the active tab's platform

The side panel SHALL determine the active platform from the active tab and present
platform-scoped workspace data accordingly, re-scoping when the active tab changes.
When no supported host tab is active, it SHALL show a neutral prompt rather than stale
or incorrect data.

#### Scenario: Panel reflects the active host

- **WHEN** the active tab is a supported host
- **THEN** the panel scopes its data to that platform

#### Scenario: Panel re-scopes when the active tab changes

- **WHEN** the user switches to a different supported host tab
- **THEN** the panel re-scopes to the newly active platform

#### Scenario: Neutral state with no supported tab

- **WHEN** no supported host tab is active
- **THEN** the panel shows a neutral "open a supported chat" prompt
