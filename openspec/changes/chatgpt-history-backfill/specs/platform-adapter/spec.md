## ADDED Requirements

### Requirement: History expansion sweep loads a paginated host list to its end

The generic adapter SHALL expose `expandHistory(opts)`, a best-effort, config-driven sweep that
drives a host's lazily-paginated conversation list to its end so `listConversations()` can observe
the user's full history. The sweep SHALL run only when the config declares
`behaviors.historyExpansion` with `mode: "scroll"`; an adapter whose config omits `historyExpansion`
SHALL resolve immediately without touching the DOM.

Each round SHALL set the discovered scroller's `scrollTop` to its `scrollHeight`, wait a settle
interval, then re-measure the rendered item count and `scrollHeight`. The sweep SHALL stop when
NEITHER the item count NOR the `scrollHeight` has grown for a configured number of consecutive
rounds, and SHALL also stop at a hard round cap and a hard wall-clock cap. The sweep SHALL restore
the scroller's original `scrollTop` on every exit path, including the capped and error paths.

The sweep SHALL resolve with a summary reporting the starting item count, the final item count, the
number of distinct item ids observed across all rounds, the number of rounds run, and whether it
completed by plateau or was stopped by a cap. The sweep SHALL NOT throw: a missing list, a missing
scroller, or a DOM error SHALL resolve as a no-op summary so a failed sweep never disrupts the tab.

#### Scenario: Paginated list is loaded to its end

- **WHEN** `expandHistory()` runs against a host list that renders more items each time its scroller
  reaches the end, until a fixed total is reached
- **THEN** the sweep performs rounds until neither the item count nor the `scrollHeight` grows
- **AND** `listConversations()` afterwards returns every item of the fixed total
- **AND** the summary reports completion by plateau

#### Scenario: Placeholder rounds do not stop the sweep early

- **WHEN** a round grows `scrollHeight` without growing the item count (the host rendered
  placeholder rows before its next page landed)
- **THEN** the sweep treats the round as growth and continues

#### Scenario: Sweep is bounded by hard caps

- **WHEN** a host list never stops growing
- **THEN** the sweep stops at its round cap or wall-clock cap, whichever comes first
- **AND** the summary reports that it was stopped by a cap rather than by plateau

#### Scenario: Original scroll position is restored

- **WHEN** a sweep ends, whether by plateau, by a cap, or because the scroller could not be found
- **THEN** the scroller's `scrollTop` is the value it held before the sweep began

#### Scenario: Config without historyExpansion is a no-op

- **WHEN** `expandHistory()` is called on an adapter whose config declares no `historyExpansion`
- **THEN** it resolves without scrolling anything
- **AND** the summary reports zero rounds run

#### Scenario: Sweep never throws

- **WHEN** `expandHistory()` runs against a DOM where the configured `conversationList` does not
  resolve
- **THEN** it resolves with a no-op summary rather than rejecting

### Requirement: The scroll container is discovered at runtime

The sweep SHALL locate the scrollable element at runtime rather than from a configured selector. It
SHALL consider the configured `conversationList` element itself, its ancestors up to a bounded
depth, and its descendants, keeping every candidate whose computed `overflow-y` is `auto` or
`scroll` and whose `scrollHeight` exceeds its `clientHeight`, and SHALL select the candidate with
the largest `scrollHeight - clientHeight`. When no element candidate qualifies, it SHALL fall back
to the document scrolling element.

Runtime discovery is required because the real scroller is not the configured list element on any
supported platform: it is an ancestor of the list on ChatGPT and Gemini and a descendant of it on
Claude and Perplexity. Discovering it avoids adding a selector to the hot-fix surface.

#### Scenario: Scroller is an ancestor of the list

- **WHEN** the list element does not scroll but an ancestor has `overflow-y: auto` and overflowing
  content
- **THEN** that ancestor is selected as the scroller

#### Scenario: Scroller is a descendant of the list

- **WHEN** the list element does not scroll but a descendant has `overflow-y: auto` and overflowing
  content
- **THEN** that descendant is selected as the scroller

#### Scenario: The largest scrollable candidate wins

- **WHEN** several related elements qualify as scrollable
- **THEN** the one with the greatest `scrollHeight - clientHeight` is selected

#### Scenario: Nothing scrollable yields a no-op

- **WHEN** neither the list, its ancestors, its descendants, nor the document can scroll
- **THEN** the sweep resolves as a no-op without error

### Requirement: A backfill sweep runs once per install per platform

The content script SHALL run the history-expansion sweep at most once per install per platform. It
SHALL consult durable, worker-owned state before sweeping and SHALL record the outcome afterwards,
so the sweep does not repeat on later page loads or after a service-worker restart. The recorded
outcome SHALL distinguish a sweep that completed by plateau from one stopped by a cap.

List ingest SHALL be suspended for the duration of the sweep and a single ingest SHALL be performed
once it ends, so no partially-loaded snapshot of the host list reaches the worker.

#### Scenario: First visit sweeps, later visits do not

- **WHEN** a platform with `historyExpansion` is activated and no backfill has been recorded for it
- **THEN** the sweep runs and its outcome is recorded
- **AND** a subsequent activation of the same platform does not sweep again

#### Scenario: Recorded state survives worker restart

- **WHEN** the service worker is terminated and restarted after a backfill was recorded
- **THEN** a later activation still reads the backfill as done and does not sweep

#### Scenario: Ingest is suspended during the sweep

- **WHEN** the host list mutates repeatedly while a sweep is in progress
- **THEN** no `conversation.ingest` is sent during the sweep
- **AND** exactly one ingest is sent after it ends, carrying the fully-loaded list

## MODIFIED Requirements

### Requirement: PlatformAdapter is the only platform-facing contract

The system SHALL expose a single `PlatformAdapter` interface as the
only platform-specific contract visible outside the `adapters/` module. Every
platform SHALL be served by one generic, config-driven adapter implementation
with no per-platform code paths.

#### Scenario: Adapter is built from a config

- **WHEN** the generic adapter is created from a valid `AdapterConfig`
- **THEN** it returns an object implementing the full `PlatformAdapter` interface
  (`platformId`, `configVersion`, `selfCheck`, `detectConversation`,
  `listConversations`, `expandHistory`, `readMessages`, `getInputElement`, `insertText`, `submit`,
  `mountPoints`, `observe`)
- **AND** its `platformId` and `configVersion` reflect the config it was built from

#### Scenario: No per-platform branching

- **WHEN** two different valid configs are supplied to the generic adapter
- **THEN** both produce a working adapter using the same implementation
- **AND** behavior differs only by the configs' `selectors` and `behaviors`

### Requirement: AdapterConfig schema validation

The system SHALL validate every `AdapterConfig` against the schema
before use: `platformId` MUST be a known `PlatformId`, `configVersion` MUST be a
semver string, `hostMatch` MUST be a non-empty list of URL match patterns, every
required `selectors` key MUST be present and a string, and `behaviors.insertMode`
and `behaviors.submitMode` MUST be members of their enums. The schema SHALL accept
an **optional** `authedMarker` selector string; when present it MUST be a non-empty
string, and when absent the platform is never classified signed-out (today's
behavior).

The schema SHALL also accept an **optional** `behaviors.historyExpansion` object. When present, its
`mode` MUST be a member of the history-expansion mode enum, whose only implemented member is
`scroll`; its optional numeric tuning fields (settle interval, consecutive stable rounds, round cap,
wall-clock cap) MUST be positive numbers when supplied and MUST fall back to defaults when omitted.
When `historyExpansion` is absent the platform performs no history sweep.

#### Scenario: Valid config passes validation

- **WHEN** a config containing all required fields with correct types is validated
- **THEN** validation succeeds and returns the typed `AdapterConfig`

#### Scenario: Optional authedMarker is accepted

- **WHEN** a config carries an `authedMarker` non-empty string selector
- **THEN** validation succeeds and the typed `AdapterConfig` exposes `authedMarker`
- **AND** a config that omits `authedMarker` still validates

#### Scenario: Optional historyExpansion is accepted

- **WHEN** a config carries `behaviors.historyExpansion` with `mode: "scroll"`
- **THEN** validation succeeds and the typed `AdapterConfig` exposes `historyExpansion`
- **AND** a config that omits `historyExpansion` still validates

#### Scenario: Malformed config is rejected

- **WHEN** a config is missing a required selector, carries an unknown
  `platformId`, has a non-semver `configVersion`, uses an invalid behavior enum, or
  supplies an empty-string `authedMarker`
- **THEN** validation fails and returns a list of validation errors
- **AND** no adapter is built from it

#### Scenario: Malformed historyExpansion is rejected

- **WHEN** a config carries `historyExpansion` with a `mode` outside the enum, or a tuning field
  that is not a positive number
- **THEN** validation fails and returns a list of validation errors
- **AND** no adapter is built from it
