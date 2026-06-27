# adapter-resilience Specification

## Purpose

The adapter-resilience capability keeps per-platform LLM adapters observable and self-healing. It persists per-platform health in durable storage that survives service-worker termination, drives a degraded state from content-script `selfCheck()` reports, runs a `chrome.alarms`-driven canary watchdog that re-surfaces still-degraded platforms, nudges the config loader toward a schema-validated remote refresh via a hot-fix flag (never remote code), and mounts a per-platform breakage-notice banner — all isolated so a breakage on one platform never disables the overlay on another.

## Requirements

### Requirement: Durable per-platform health state

The system SHALL persist per-platform health (whether the last `selfCheck()`
passed, which anchors were missing, and a hot-fix flag) in durable storage that
survives service-worker termination, and SHALL rehydrate it on worker wake. No
health state may live only in worker memory.

#### Scenario: Health survives a worker restart

- **WHEN** a platform has been recorded degraded and the service worker is then
  restarted (cold start)
- **THEN** reading health after the restart still reports that platform as degraded

#### Scenario: Unknown platform defaults to healthy

- **WHEN** health is queried for a platform that has never reported
- **THEN** it is reported as not degraded

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

### Requirement: Scheduled canary watchdog

The system SHALL register a `chrome.alarms`-driven canary synchronously at
service-worker load (so it survives cold starts), with a period no greater than 24
hours. On each tick the canary SHALL re-evaluate persisted health and re-broadcast
`platform.degraded` for every platform still degraded, so a degraded platform is
surfaced within the alarm window. The canary SHALL NOT use `setTimeout` or
`setInterval`.

#### Scenario: Canary alarm is registered at worker load

- **WHEN** the background service-worker module is evaluated, as on a cold start
- **THEN** a `chrome.alarms` alarm for the canary is created
- **AND** an `onAlarm` listener is registered before any asynchronous init runs

#### Scenario: A canary tick re-surfaces a still-degraded platform

- **WHEN** a platform is persisted as degraded and the canary alarm fires
- **THEN** a `platform.degraded` broadcast is emitted for that platform

#### Scenario: A canary tick does not re-surface a healthy platform

- **WHEN** no platform is degraded and the canary alarm fires
- **THEN** no `platform.degraded` broadcast is emitted

### Requirement: Hot-fix flag nudges the loader toward a remote refresh

When a platform's hot-fix flag is set, the config loader SHALL be directed to
attempt a remote config refresh on the next load for that platform, so a published
selector fix is picked up without a store release. The flag SHALL NOT cause any
remote code to be loaded — only schema-validated config data.

#### Scenario: Degraded platform requests a remote refresh

- **WHEN** a platform is degraded with its hot-fix flag set
- **AND** its config is loaded again
- **THEN** the loader attempts to fetch the remote config for that platform

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

### Requirement: Breakage isolation across platforms

A degraded platform SHALL affect only its own platform. The banner SHALL mount only
on tabs of the degraded platform, and another platform's tab SHALL show no banner
and remain fully operational.

#### Scenario: Only the degraded platform shows the banner

- **WHEN** one platform is degraded and a tab of a different, healthy platform is
  evaluated
- **THEN** the healthy platform's tab mounts no breakage banner
- **AND** the healthy platform's overlay continues to operate

### Requirement: Resilience emits diagnostics telemetry
When diagnostics consent is enabled, the resilience layer SHALL emit id-less diagnostics events for
adapter health transitions: `adapter_selfcheck_failed` (with `platform`, `configVer`, `anchorKey`),
`adapter_fallback_shown` (with `platform`, `configVer`, `reason`), and `adapter_recovered` (with
`platform`, `configVer`). These events SHALL carry no user content and no `distinct_id`, and SHALL be
suppressed entirely when diagnostics consent is off.

#### Scenario: selfCheck failure emits the hot-fix signal
- **WHEN** a platform's `selfCheck` fails and diagnostics consent is on
- **THEN** an `adapter_selfcheck_failed` event is emitted with `platform`, `configVer`, and the failing
  `anchorKey` from the fixed anchor enum
- **AND** the event carries no `distinct_id`

#### Scenario: Recovery is reported
- **WHEN** a platform's `selfCheck` passes again after a prior failure and diagnostics consent is on
- **THEN** an `adapter_recovered` event is emitted for that platform and `configVer`

#### Scenario: Diagnostics off suppresses health events
- **WHEN** an adapter health transition occurs and diagnostics consent is off
- **THEN** no diagnostics event is emitted or sent

#### Scenario: Anchor identity is an enum, not a selector
- **WHEN** an `adapter_selfcheck_failed` event is emitted
- **THEN** `anchorKey` is a value from the fixed anchor enum and never a raw CSS selector or DOM content

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
