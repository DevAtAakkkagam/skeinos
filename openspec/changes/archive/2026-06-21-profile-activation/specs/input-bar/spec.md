## MODIFIED Requirements

### Requirement: Deferred controls render as disabled stubs

The bar SHALL reserve layout for the not-yet-built model-selection control by rendering it as a
visibly disabled stub, so the bar's layout does not reflow when that feature is added later. The
profile control SHALL be functional (see the Profile chip requirement) and is no longer a stub.

#### Scenario: Model control appears disabled

- **WHEN** the input action bar is shown
- **THEN** the model-selection control is present but disabled

#### Scenario: Profile control is interactive

- **WHEN** the input action bar is shown
- **THEN** the profile control is interactive (not a disabled stub)

## ADDED Requirements

### Requirement: Profile chip lists profiles and marks the active one

The bar SHALL provide a Profile chip that opens a menu listing the saved instruction profiles and
indicates which profile is currently active. The active profile SHALL be read from the persisted
global active-profile preference, so the chip reflects the same active profile across tabs and after
a reload.

#### Scenario: Menu lists profiles and shows the active one

- **WHEN** the user opens the Profile chip
- **THEN** the saved profiles are listed
- **AND** the currently active profile is indicated

#### Scenario: Active profile persists across reload

- **WHEN** a profile has been activated
- **AND** the bar is re-rendered (e.g. another tab or after a reload)
- **THEN** the chip shows that profile as active

### Requirement: Selecting a profile activates it and inserts its instruction

When the user selects a profile that applies to the current platform, the bar SHALL set it as the
global active profile and SHALL insert its composed text — the instruction text plus a response-
style directive when the profile defines a response style — into the host composer through the
append-only insertion path, without auto-submitting. Insertion SHALL use the PREPEND mode (no
system-prompt mode is used in this slice).

#### Scenario: Selecting an applicable profile injects its instruction

- **WHEN** the user selects a profile whose `appliesTo` includes the current platform
- **THEN** that profile becomes the active profile
- **AND** its instruction text (with the response-style directive when set) is inserted into the
  composer, appended and not auto-submitted

#### Scenario: Profiles not applicable to the current platform are disabled

- **WHEN** the Profile menu is shown on a platform a profile does not apply to
- **THEN** that profile is shown disabled and cannot be activated or injected on this platform

#### Scenario: A profile with no response style inserts only the instruction

- **WHEN** the user selects an applicable profile that defines no response style
- **THEN** only its instruction text is inserted
