## ADDED Requirements

### Requirement: Diagnostics telemetry is opt-in and off by default
The system SHALL collect only diagnostics telemetry (crashes + adapter health) and SHALL collect no
usage or product analytics. The diagnostics consent flag (`diagnosticsOptIn`) SHALL default to **off**
and SHALL be read from durable settings before any event is sent. The system SHALL NOT send any telemetry
unless the user has explicitly enabled the flag.

#### Scenario: Fresh install sends nothing
- **WHEN** the extension is installed and the user has changed no settings
- **THEN** `diagnosticsOptIn` reads as off
- **AND** no telemetry request is ever sent to any endpoint

#### Scenario: Opted in sends diagnostics
- **WHEN** the user enables `diagnosticsOptIn`
- **THEN** crash and adapter-health events may be sent

### Requirement: The service worker is the single telemetry egress
Only the service worker SHALL send telemetry. Content scripts and the shadow-DOM UI SHALL NOT POST to
any telemetry endpoint directly; they SHALL emit events through the messaging hub to the worker, which
gates on consent, builds the payload, and sends.

#### Scenario: UI-origin event routes through the worker
- **WHEN** a shadow-DOM UI surface records a diagnostics event
- **THEN** the event is delivered to the worker via the messaging hub
- **AND** the UI makes no direct network request to the telemetry endpoint

#### Scenario: Worker-origin event uses the same path
- **WHEN** the service worker itself records an event (e.g. a migration crash)
- **THEN** it is gated, built, and sent through the same egress path as UI-origin events
- **AND** the path does not depend on `window`

### Requirement: Events conform to a closed taxonomy with allowlisted properties
Every telemetry event SHALL have a name drawn from a fixed enum, and every property SHALL be a value
drawn from that property's fixed value-enum or a strict version/token string. No property SHALL carry
free user text, with the sole exception of the scrubbed `$exception.message` field. The worker SHALL
reject (not send) any event that violates the allowlist.

#### Scenario: Disallowed event name is rejected
- **WHEN** an event with a name not in the enum is submitted
- **THEN** the worker drops it and sends nothing

#### Scenario: Disallowed property key is rejected
- **WHEN** an event carries a property key not in that event's allowlist
- **THEN** the worker drops the event and sends nothing

#### Scenario: Free-text value in a categorical property is rejected
- **WHEN** a categorical property carries a string outside its value-enum
- **THEN** the worker drops the event and sends nothing

#### Scenario: Inventory counts and user content are never sent
- **WHEN** any event is built
- **THEN** the payload contains no folder/prompt/profile/tag names, no text bodies, no search queries,
  no tag values, no conversation ids/titles/content, and no URL paths

### Requirement: Allowlist enforcement is covered by a fake-transport test
The system SHALL include an automated test using a fake transport that asserts, for every captured
payload: the event name is in the enum; every property key is in the event's allowlist; every string
value is in its property's value-enum except `$exception.message`; `$exception.message` passes a
sensitive-substring denylist; and `distinct_id` equals the fixed anonymous constant.

#### Scenario: A payload violating any rule fails the test
- **WHEN** the suite runs against a payload that breaks any allowlist rule
- **THEN** the test fails

#### Scenario: Conformant payloads pass
- **WHEN** the suite runs against payloads that satisfy every rule
- **THEN** the test passes

### Requirement: No per-user identity
Diagnostics events SHALL carry no per-user identifier. Because PostHog's ingest requires a `distinct_id`
on every event, every event SHALL carry a single fixed constant (`"anonymous"`) that is identical for
every install and encodes no information about the user. No locally generated nonce, hash, or stable
per-device id SHALL be transmitted.

#### Scenario: Every event carries the fixed anonymous id
- **WHEN** a crash or adapter-health event is sent
- **THEN** its `distinct_id` is exactly the fixed anonymous constant

#### Scenario: No identifying value is transmitted
- **WHEN** any telemetry request is sent
- **THEN** the payload contains no per-user or per-device identifier beyond the shared anonymous constant

### Requirement: Exception messages are scrubbed and sent in the Error Tracking shape
Crash (`$exception`) events SHALL send only the error name, a truncated and denylist-filtered message,
and stack frames limited to the extension's own bundle files; host-page stack frames SHALL be dropped.
Crashes SHALL be sent in PostHog Error Tracking's `$exception_list` structure, and the allowlist
validator SHALL re-apply the message denylist and own-bundle-frame rules inside that structure.

#### Scenario: Message is truncated and filtered
- **WHEN** an exception with a long message containing a denylisted pattern is captured
- **THEN** the sent message is truncated and the denylisted substring is removed or masked

#### Scenario: Host-page frames are dropped
- **WHEN** a captured stack contains frames from the host page
- **THEN** those frames are excluded from the sent payload

### Requirement: Egress is batched durably and survives worker death
The worker SHALL buffer events in durable storage and flush on a `chrome.alarms` tick or a size
threshold, never via `setTimeout`. Buffered events SHALL survive service-worker termination, and the
worker SHALL re-check consent at flush time.

#### Scenario: Buffer survives worker restart
- **WHEN** events are buffered and the worker is terminated and restarted
- **THEN** the buffered events are still present and are flushed on the next alarm

#### Scenario: Flush re-checks consent
- **WHEN** a flush fires for buffered events after diagnostics consent was withdrawn
- **THEN** those events are not sent

### Requirement: Opt-out is local-authoritative and instant
Disabling the diagnostics toggle SHALL immediately stop new events at the worker gate and SHALL drop
(not drain) any buffered events. Opt-out SHALL NOT depend on a network round-trip.

#### Scenario: New events stop immediately on opt-out
- **WHEN** a user turns the diagnostics toggle off
- **THEN** subsequent events are dropped at the gate with no network call

#### Scenario: Buffered events are dropped on opt-out
- **WHEN** the diagnostics toggle is turned off while events sit in the buffer
- **THEN** those buffered events are discarded and never sent

### Requirement: Telemetry sends only to the PostHog EU endpoint with no SDK
The worker SHALL send telemetry only to the configured PostHog EU endpoint, as a plain `fetch` of
hand-built JSON. The extension SHALL bundle no vendor SDK and load no remote code for telemetry. Session
replay, autocapture, and feature-flag fetching SHALL NOT be present.

#### Scenario: Single declared endpoint
- **WHEN** any telemetry request is sent
- **THEN** its destination is the configured PostHog EU host and no other

#### Scenario: No remote code
- **WHEN** the extension bundle is inspected
- **THEN** it contains no vendor telemetry SDK and no loader/CDN script
