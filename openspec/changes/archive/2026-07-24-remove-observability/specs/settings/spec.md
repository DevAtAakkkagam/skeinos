# settings

## REMOVED Requirements

### Requirement: Diagnostics consent flag
**Reason**: The diagnostics telemetry stream this flag gated is removed in full (supersedes D29). With no telemetry egress there is nothing to consent to, so `diagnosticsOptIn` is deleted from the `Settings` interface and from `DEFAULT_SETTINGS`, along with its options-page toggle.
**Migration**: None. Settings are a defaults-merged blob, not a `Repo<T>` store with a migration list — an installed profile that still carries `diagnosticsOptIn: true` on disk simply reads back an object where the key is ignored. The legacy, never-wired `Settings.telemetry` boolean is unaffected and stays as-is.
