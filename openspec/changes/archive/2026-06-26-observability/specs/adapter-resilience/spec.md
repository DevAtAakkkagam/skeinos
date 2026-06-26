## ADDED Requirements

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
