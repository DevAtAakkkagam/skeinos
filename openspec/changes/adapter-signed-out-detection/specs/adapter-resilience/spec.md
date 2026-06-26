## MODIFIED Requirements

### Requirement: Health reporting drives degraded state

A content script SHALL report its `selfCheck()` result to the service worker. A
failing report SHALL mark that platform degraded, persist it, broadcast the
existing `platform.degraded` message, and set the platform's hot-fix flag **only
when the failure is classified as breakage** (the configured `authedMarker`
resolves, i.e. the user is signed in but an anchor is genuinely missing). A failing
`selfCheck()` on a platform classified as **signed-out** (`authedMarker` absent)
SHALL NOT mark the platform degraded and SHALL NOT set the hot-fix flag. A passing
report SHALL clear the degraded state and the hot-fix flag for that platform.

#### Scenario: A signed-in breakage report marks the platform degraded

- **WHEN** a content script reports a failed `selfCheck()` for a platform whose
  `authedMarker` resolves
- **THEN** that platform is persisted as degraded
- **AND** a `platform.degraded` broadcast is emitted for that platform
- **AND** the platform's hot-fix flag is set

#### Scenario: A signed-out failure does not mark the platform degraded

- **WHEN** a content script's `selfCheck()` fails on a platform classified as
  signed-out (`authedMarker` does not resolve)
- **THEN** the platform is NOT persisted as degraded
- **AND** no `platform.degraded` broadcast is emitted for that platform
- **AND** the hot-fix flag is NOT set

#### Scenario: A passing report clears the degraded state

- **WHEN** a content script reports a passing `selfCheck()` for a platform that was
  degraded
- **THEN** that platform is no longer degraded
- **AND** its hot-fix flag is cleared

### Requirement: Per-platform breakage-notice banner

The system SHALL mount a breakage-notice banner on a platform's tab only when that
platform is degraded and classified as a signed-in breakage. The banner is built on
the shadow-DOM `ui-shell` mount harness, informs the user the overlay is unavailable,
and offers Retry and Dismiss. The banner SHALL expose an alert role and be keyboard-operable.
Retry SHALL re-run `selfCheck()`; when it passes, the banner SHALL be dismissed and a
passing health report sent. The banner SHALL NOT be mounted when the platform is
classified as signed-out (composer-only or dormant).

#### Scenario: A simulated broken config on a signed-in page raises the banner

- **WHEN** a content script loads on a platform whose `selfCheck()` fails and whose
  `authedMarker` resolves
- **THEN** a breakage-notice banner is mounted on that tab inside a shadow root
- **AND** it presents Retry and Dismiss controls with an alert role

#### Scenario: A signed-out page does not raise the banner

- **WHEN** a content script loads on a platform whose `selfCheck()` fails and whose
  `authedMarker` does not resolve
- **THEN** no breakage-notice banner is mounted

#### Scenario: Retry on a recovered platform clears the notice

- **WHEN** the user activates Retry and `selfCheck()` now passes
- **THEN** the banner is unmounted
- **AND** a passing health report is sent for that platform

## ADDED Requirements

### Requirement: Signed-out tabs are excluded from breakage telemetry

A platform classified as signed-out SHALL NOT emit the
`adapter_fallback_shown(reason: 'selfcheck_failed')` diagnostic. The system MAY
instead emit a distinct, id-less `adapter_signed_out` diagnostic, gated on
diagnostics consent and scrubbed worker-side like every other diagnostic (off by
default). Breakage-classified failures SHALL continue to emit
`adapter_fallback_shown` as before.

#### Scenario: Signed-out does not pollute the fallback metric

- **WHEN** a platform is classified as signed-out after a failing `selfCheck()`
- **THEN** no `adapter_fallback_shown(selfcheck_failed)` event is emitted

#### Scenario: Signed-in breakage still emits the fallback metric

- **WHEN** a platform is classified as a signed-in breakage after a failing
  `selfCheck()`
- **THEN** an `adapter_fallback_shown(selfcheck_failed)` event is emitted as before
