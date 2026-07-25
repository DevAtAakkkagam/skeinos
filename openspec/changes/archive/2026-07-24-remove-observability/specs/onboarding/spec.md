# onboarding

## REMOVED Requirements

### Requirement: Final step surfaces diagnostics consent
**Reason**: The diagnostics feature is removed in full (supersedes D29), so there is no consent to collect. The `ConsentToggle` and its mount on the final onboarding step are deleted, and `finish` no longer commits a consent value before writing the completion gate.
**Migration**: None. The toggle was embedded *inside* the final step rather than being a step of its own, so `STEP_COUNT`, the step indices, and the step dots are unchanged — the flow is the same length, minus the toggle.
