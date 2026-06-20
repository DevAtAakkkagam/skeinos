## ADDED Requirements

### Requirement: First-run gate persisted across reloads

The extension SHALL determine whether first-run onboarding is complete from a persisted
`onboardingCompleted` preference, and this determination SHALL survive a panel reload and a
service-worker restart. On a fresh install with nothing stored, onboarding SHALL be considered
not complete.

#### Scenario: Fresh install is not onboarded

- **WHEN** the onboarding state is resolved with no settings previously stored
- **THEN** onboarding is reported as not complete

#### Scenario: Completion persists across reload

- **WHEN** onboarding has been marked complete
- **AND** the extension context is reloaded
- **THEN** resolving the onboarding state reports it as complete

### Requirement: Side panel shows onboarding before the workspace

When onboarding is not complete, the side panel SHALL render the onboarding surface instead of
the workspace or the neutral empty state, regardless of whether a supported platform tab is
active. When onboarding is complete, the side panel SHALL fall through to its existing platform
behavior (workspace when a supported host is active, neutral empty state otherwise).

#### Scenario: Onboarding takes precedence with no supported tab

- **WHEN** onboarding is not complete
- **AND** no supported platform tab is active
- **THEN** the side panel renders the onboarding surface
- **AND** it does not render the neutral "open a supported chat" empty state

#### Scenario: Onboarding takes precedence with a supported tab

- **WHEN** onboarding is not complete
- **AND** a supported platform tab is active
- **THEN** the side panel renders the onboarding surface
- **AND** it does not render the workspace

#### Scenario: Completed onboarding falls through to the workspace

- **WHEN** onboarding is complete
- **AND** a supported platform tab is active
- **THEN** the side panel renders the workspace

### Requirement: Completing onboarding updates the panel live

The onboarding surface SHALL provide an action that marks onboarding complete by writing the
persisted preference. After that action, the side panel SHALL leave the onboarding surface
without requiring a reload.

#### Scenario: Get-started action closes the gate live

- **WHEN** the onboarding surface's completion action is invoked
- **THEN** onboarding is marked complete in settings
- **AND** the side panel stops rendering the onboarding surface without a reload

### Requirement: Unresolved state does not flash onboarding

While the onboarding state has not yet been resolved from storage, the side panel SHALL NOT
render the onboarding surface, so a returning, already-onboarded user never sees a flash of
first-run UI.

#### Scenario: No onboarding flash before settings resolve

- **WHEN** the onboarding state has not yet resolved from storage
- **THEN** the side panel does not render the onboarding surface
