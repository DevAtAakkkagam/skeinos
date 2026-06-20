## ADDED Requirements

### Requirement: Onboarding completion and domain preferences

The settings schema SHALL include an `onboardingCompleted` boolean that defaults to `false`,
and an optional `domain` field holding the user's chosen professional domain (`DomainId`). Both
SHALL be additive — a stored settings object missing either key SHALL fall back to the default
(`onboardingCompleted` → `false`, `domain` → undefined) without invalidating the install — and
SHALL be read and written through the existing settings accessors.

#### Scenario: Defaults on a fresh install

- **WHEN** settings are read with nothing previously stored
- **THEN** `onboardingCompleted` is `false`
- **AND** `domain` is undefined

#### Scenario: Pre-existing install without the keys stays valid

- **WHEN** a settings object stored before these keys existed is read
- **THEN** `onboardingCompleted` falls back to `false`
- **AND** `domain` falls back to undefined
- **AND** the other stored settings keys are returned unchanged

#### Scenario: Written values persist and round-trip

- **WHEN** `onboardingCompleted` is set to `true` and `domain` is set to a valid `DomainId`
- **AND** settings are read back
- **THEN** `onboardingCompleted` is `true`
- **AND** `domain` is the written `DomainId`
