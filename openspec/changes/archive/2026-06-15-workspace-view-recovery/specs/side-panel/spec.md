## MODIFIED Requirements

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
