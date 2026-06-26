# onboarding Specification

## Purpose

The onboarding capability defines the extension's first-run experience: a persisted gate that
determines whether the user has completed onboarding, the side-panel precedence that shows the
onboarding surface ahead of the workspace and neutral empty states, and the live completion flow
that dismisses onboarding without a reload. It is built on the `settings` capability's persisted
`onboardingCompleted` preference and resolves that state without flashing first-run UI at returning
users.

## Requirements

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

The onboarding surface SHALL mark onboarding complete by writing the persisted preference only
at the terminal actions of the flow — the welcome step's "I already have an account" skip and the
final step's actions ("Create your first folder", "Finish setup"). Intermediate navigation
("Get started", "Continue", "Back") SHALL NOT mark onboarding complete. After a terminal action,
the side panel SHALL leave the onboarding surface without requiring a reload.

#### Scenario: Final-step action closes the gate live

- **WHEN** a final-step action ("Create your first folder" or "Finish setup") is invoked
- **THEN** onboarding is marked complete in settings
- **AND** the side panel stops rendering the onboarding surface without a reload

#### Scenario: Welcome skip closes the gate

- **WHEN** the welcome step's "I already have an account" action is invoked
- **THEN** onboarding is marked complete in settings

#### Scenario: Intermediate navigation does not complete onboarding

- **WHEN** the user advances with "Get started" or "Continue", or returns with "Back"
- **THEN** onboarding is not marked complete
- **AND** the side panel keeps rendering the onboarding surface

### Requirement: Unresolved state does not flash onboarding

While the onboarding state has not yet been resolved from storage, the side panel SHALL NOT
render the onboarding surface, so a returning, already-onboarded user never sees a flash of
first-run UI.

#### Scenario: No onboarding flash before settings resolve

- **WHEN** the onboarding state has not yet resolved from storage
- **THEN** the side panel does not render the onboarding surface

### Requirement: Four-step onboarding stepper

The onboarding surface SHALL present a four-step stepper in order — welcome, permissions priming,
starter library, get started — with a progress indicator reflecting the current step. The user
SHALL be able to advance to the next step and return to the previous step. A reload of an
incomplete onboarding SHALL restart the flow (the gate alone is durable; step position is not).

#### Scenario: Steps advance and the indicator tracks position

- **WHEN** the surface is shown on a fresh install
- **THEN** it starts on the welcome step with the first progress marker active
- **AND** advancing moves through permissions priming, starter library, and get started in order
- **AND** the progress indicator reflects the active step

#### Scenario: Back returns to the previous step

- **WHEN** the user is on the permissions priming step and invokes "Back"
- **THEN** the surface returns to the welcome step

### Requirement: Permissions priming is informational

The permissions priming step SHALL explain, per supported platform (claude.ai,
gemini.google.com, perplexity.ai), what access is used for and what it is not, and SHALL state
that access is per-site, revocable in Settings, reads no credentials, and sends no content
anywhere. This step SHALL NOT trigger a browser permission prompt and SHALL NOT request
permissions at runtime (access is granted at install via the static host permissions).

#### Scenario: Each supported platform is explained

- **WHEN** the permissions priming step is shown
- **THEN** it lists claude.ai, gemini.google.com, and perplexity.ai
- **AND** each carries a per-site description of what the access is for

#### Scenario: No permission prompt is triggered

- **WHEN** the permissions priming step is shown or advanced past
- **THEN** no browser permission request is made

### Requirement: Starter library installs the chosen domain's seeds

The starter library step SHALL present the professional domains from the domain registry. When
the user selects a domain, the surface SHALL install that domain's starter prompts via the
worker (idempotently), persist the chosen domain to settings, and show a confirmation reporting
the actual number of prompts installed. The confirmation count SHALL come from the install
result, never a hard-coded value. Selecting a domain whose seeds are already installed SHALL add
no duplicates.

#### Scenario: Picking a domain installs its seeds and confirms the count

- **WHEN** the user selects a domain on the starter library step
- **THEN** that domain's seeds are installed through the worker
- **AND** the chosen domain is persisted to settings
- **AND** a confirmation shows the installed count returned by the install

#### Scenario: Re-selecting an installed domain adds no duplicates

- **WHEN** the user selects a domain whose seeds are already present
- **THEN** the install reports zero newly inserted prompts
- **AND** no duplicate prompts are created

### Requirement: Get-started step offers a first action

The final step SHALL let the user create their first folder or finish setup. "Create your first
folder" SHALL create a folder through the workspace writer, scoped to the active platform. Both
this action and "Finish setup" SHALL mark onboarding complete; since the onboarding surface is
only shown while a supported platform is active, the side panel SHALL then land on that
platform's workspace. There SHALL be no "open a platform" action, because the surface is only
reachable while the user is already on a supported platform.

#### Scenario: Create first folder completes onboarding

- **WHEN** the user invokes "Create your first folder" on the final step
- **THEN** a folder scoped to the active platform is created through the workspace writer
- **AND** onboarding is marked complete

#### Scenario: Finish setup completes onboarding

- **WHEN** the user invokes "Finish setup"
- **THEN** onboarding is marked complete
- **AND** the side panel leaves the onboarding surface

### Requirement: Final step surfaces diagnostics consent
The final onboarding step (above "Finish setup") SHALL present the diagnostics consent toggle
(`diagnosticsOptIn`), shown **unchecked**, framed as an explicit opt-in. Finishing setup without ticking
it SHALL leave the flag off, and onboarding completion SHALL NOT enable the flag on its own.

#### Scenario: Toggle absent on the welcome step
- **WHEN** the user is on the welcome step
- **THEN** no diagnostics consent toggle is shown

#### Scenario: Toggle shown unchecked on the final step
- **WHEN** the user reaches the final step
- **THEN** the diagnostics consent toggle is shown unchecked

#### Scenario: Finishing without ticking leaves diagnostics off
- **WHEN** the user clicks Finish setup without ticking the toggle
- **THEN** `diagnosticsOptIn` remains off

#### Scenario: Opting in during onboarding persists
- **WHEN** the user ticks the diagnostics toggle and completes onboarding
- **THEN** the flag reads as on afterward
