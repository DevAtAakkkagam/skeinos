## ADDED Requirements

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
