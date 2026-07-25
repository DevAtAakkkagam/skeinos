# adapter-resilience

## REMOVED Requirements

### Requirement: Resilience emits diagnostics telemetry
**Reason**: The diagnostics stream these events fed is removed in full (supersedes D29). `adapter_selfcheck_failed`, `adapter_fallback_shown`, and `adapter_recovered` no longer exist, so the `recordEvent` call sites in `adapters/resilience/report.ts` and the `anchorKey`/`configVer` plumbing that existed only to label them are deleted.
**Migration**: None. The resilience machinery this requirement sat beside is untouched: a failing `selfCheck` still persists degraded state, arms the hot-fix flag, and fans out the `platform.degraded` broadcast that raises the in-product banner; recovery still clears both. Only the emit side effects are gone. The now-dead `configVer` field is also dropped from the `platform.report-health` request contract and from `reportHealth(...)`.

### Requirement: Signed-out tabs are excluded from breakage telemetry
**Reason**: With no telemetry there is no fallback metric to keep clean, so the requirement has no subject. The `adapter_signed_out` diagnostic it permitted is deleted along with the rest of the stream.
**Migration**: None. The classification behavior this requirement protected is unchanged and remains specified elsewhere in this capability: a signed-out failure does not mark the platform degraded (see "Health reporting drives degraded state") and does not raise the banner (see "Per-platform breakage-notice banner"). Only the telemetry clause is removed.
