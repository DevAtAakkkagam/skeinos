# side-panel Specification

## Purpose

The side-panel capability hosts the workspace UI (the sidebar shell and folder tree) in
the browser's native side panel as an extension page, rather than injecting it into the
host page. It opens from the toolbar action on supported hosts; the **active-conversation
context and host gating** derive from the active tab's platform, while the **folder/workspace
browser is unified** across every platform (an optional platform view-filter may narrow it —
D28). It stays in sync with the service worker through the same request / broadcast messaging
the rest of the UI uses.

## Requirements

### Requirement: Workspace UI hosted in the browser side panel

The system SHALL host the workspace UI (the sidebar shell and folder tree) in the
browser's native side panel as an extension page, rendered with the shared mount
harness and theme, and kept in sync with the service worker through the same request /
broadcast messaging the rest of the UI uses. The side panel SHALL NOT be injected into
the host page. Because the service worker is terminated on idle (MV3 lifecycle) and
broadcast delivery is best-effort, the panel SHALL NOT depend on broadcasts alone to stay
current: it SHALL reconcile by re-reading worker state when it becomes visible again
(`document.visibilitychange` to visible) and on window focus, so a panel left open while its
worker was torn down converges on current state when the user returns to it, without a remount.

#### Scenario: Side panel renders the workspace shell

- **WHEN** the side panel page loads
- **THEN** it mounts the sidebar shell as an extension page
- **AND** it reads workspace state from the service worker and re-renders on broadcasts

#### Scenario: Workspace UI is not injected into the host page

- **WHEN** a supported host page is open with the panel available
- **THEN** no workspace UI is added to the host page's DOM by the content script

#### Scenario: Panel reconciles when it regains visibility

- **WHEN** the side panel was open while its service worker was terminated and the user returns to it (the document becomes visible again)
- **THEN** the panel re-reads worker state
- **AND** it renders the current folders without requiring a remount

#### Scenario: Panel reconciles on window focus

- **WHEN** the panel's window regains focus
- **THEN** the panel re-reads worker state and reflects any changes made while it was unfocused

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

The side panel SHALL determine the active platform from the active tab and use it for
the **active-conversation context** (the card reflecting the conversation open in that
tab) and for **host gating** (enabling the panel only on supported hosts), re-deriving
when the active tab changes. The **folder/workspace browser SHALL be unified** — its
folder contents and counts span every platform and are NOT scoped to the active tab's
platform; an optional platform view-filter (default "All") may narrow them. When no
supported host tab is active, the panel SHALL show a neutral prompt rather than stale or
incorrect data.

#### Scenario: Active-conversation context reflects the active host

- **WHEN** the active tab is a supported host with an open conversation
- **THEN** the panel's active-conversation context reflects that tab's platform and
  conversation

#### Scenario: Folder browser stays unified across the active host

- **WHEN** the active tab is a supported host
- **THEN** the folder browser still shows folders' conversations from every platform
  (it is not narrowed to the active tab's platform unless the user applies the platform
  filter)

#### Scenario: Active-conversation context re-derives when the active tab changes

- **WHEN** the user switches to a different supported host tab
- **THEN** the active-conversation context re-derives to the newly active platform,
  while the unified folder browser is unaffected

#### Scenario: Neutral state with no supported tab

- **WHEN** no supported host tab is active
- **THEN** the panel shows a neutral "open a supported chat" prompt
