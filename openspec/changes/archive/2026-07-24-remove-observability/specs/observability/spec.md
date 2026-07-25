# observability (removed)

This delta retires the `observability` capability in full. Every requirement in the
current `openspec/specs/observability/spec.md` is removed; no diagnostics or telemetry
behavior remains in the product.

## REMOVED Requirements

### Requirement: Diagnostics telemetry is opt-in and off by default
**Reason**: The entire diagnostics feature is removed (supersedes D29); there is no telemetry stream left to gate.
**Migration**: None. The `diagnosticsOptIn` setting and its onboarding/Settings toggle are deleted; any stored value is ignored on read.

### Requirement: The service worker is the single telemetry egress
**Reason**: There is no telemetry egress at all; the extension contacts zero external endpoints.
**Migration**: None. The `telemetry.emit` request contract and its worker handler are deleted.

### Requirement: Events conform to a closed taxonomy with allowlisted properties
**Reason**: No events are produced, so the taxonomy and allowlist have no subject.
**Migration**: None. `taxonomy.ts` and the event builder are deleted.

### Requirement: Allowlist enforcement is covered by a fake-transport test
**Reason**: The allowlist and its transport are removed, so the guard test is removed with them.
**Migration**: None. `tests/observability-allowlist.test.ts` and `tests/observability-egress.test.ts` are deleted.

### Requirement: No per-user identity
**Reason**: No events are sent, so there is no `distinct_id` to constrain.
**Migration**: None. `identity.ts` is deleted.

### Requirement: Exception messages are scrubbed and sent in the Error Tracking shape
**Reason**: No exceptions are captured or transmitted; the scrubber and Error Tracking payload builder are removed.
**Migration**: None. `installExceptionCapture` and `scrubber.ts` are deleted; unhandled errors surface only in the local console as before.

### Requirement: Egress is batched durably and survives worker death
**Reason**: With no egress, the durable buffer and flush alarm are removed.
**Migration**: None. `buffer.ts` and the `chrome.alarms` flush registration are deleted.

### Requirement: Opt-out is local-authoritative and instant
**Reason**: Opt-out is moot when nothing is ever collected or sent.
**Migration**: None. Diagnostics are permanently and unconditionally off.

### Requirement: Telemetry sends only to the PostHog EU endpoint with no SDK
**Reason**: The PostHog EU endpoint, its project key, and the fetch transport are removed; the extension makes no external network requests.
**Migration**: None. `config.ts` (PostHog host + key) and `egress.ts` are deleted; the privacy policy and store data-use disclosure are updated to state that no data leaves the device.
