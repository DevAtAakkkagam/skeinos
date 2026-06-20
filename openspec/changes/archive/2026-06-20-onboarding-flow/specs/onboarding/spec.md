## MODIFIED Requirements

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

## ADDED Requirements

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
