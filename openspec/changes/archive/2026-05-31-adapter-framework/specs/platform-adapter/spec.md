## ADDED Requirements

### Requirement: PlatformAdapter is the only platform-facing contract

The system SHALL expose a single `PlatformAdapter` interface (LLD §4.1) as the
only platform-specific contract visible outside the `adapters/` module. Every
platform SHALL be served by one generic, config-driven adapter implementation
with no per-platform code paths.

#### Scenario: Adapter is built from a config

- **WHEN** the generic adapter is created from a valid `AdapterConfig`
- **THEN** it returns an object implementing the full `PlatformAdapter` interface
  (`platformId`, `configVersion`, `selfCheck`, `detectConversation`,
  `listConversations`, `readMessages`, `getInputElement`, `insertText`, `submit`,
  `mountPoints`, `observe`)
- **AND** its `platformId` and `configVersion` reflect the config it was built from

#### Scenario: No per-platform branching

- **WHEN** two different valid configs are supplied to the generic adapter
- **THEN** both produce a working adapter using the same implementation
- **AND** behavior differs only by the configs' `selectors` and `behaviors`

### Requirement: AdapterConfig schema validation

The system SHALL validate every `AdapterConfig` against the schema (LLD §4.2)
before use: `platformId` MUST be a known `PlatformId`, `configVersion` MUST be a
semver string, `hostMatch` MUST be a non-empty list of URL match patterns, every
required `selectors` key MUST be present and a string, and `behaviors.insertMode`
and `behaviors.submitMode` MUST be members of their enums.

#### Scenario: Valid config passes validation

- **WHEN** a config containing all required fields with correct types is validated
- **THEN** validation succeeds and returns the typed `AdapterConfig`

#### Scenario: Malformed config is rejected

- **WHEN** a config is missing a required selector, carries an unknown
  `platformId`, has a non-semver `configVersion`, or uses an invalid behavior enum
- **THEN** validation fails and returns a list of validation errors
- **AND** no adapter is built from it

### Requirement: Config loader prefers newest valid config with bundled fallback

The loader SHALL always have a bundled config available offline, and SHALL adopt a
remote config only when it both validates against the schema and carries a semver
`configVersion` greater than the bundled config's. Any fetch failure, parse error,
or validation failure SHALL fall back to the bundled config. Remote config is data
only; remote code SHALL never be loaded.

#### Scenario: Newer valid remote config is adopted

- **WHEN** a remote config validates and its `configVersion` is greater than the
  bundled config's
- **THEN** the loader returns the remote config

#### Scenario: Invalid remote config falls back to bundled

- **WHEN** the remote fetch fails, returns unparseable data, or returns a config
  that fails schema validation
- **THEN** the loader returns the bundled config
- **AND** the extension remains functional offline

#### Scenario: Older or equal remote config is ignored

- **WHEN** a remote config validates but its `configVersion` is not greater than
  the bundled config's
- **THEN** the loader returns the bundled config

### Requirement: Self-check isolates platform breakage

On initialization an adapter SHALL run `selfCheck()` which resolves the required
anchors against the document and returns `{ ok, missing }`. When required anchors
are missing the overlay SHALL NOT mount for that platform, a `platform.degraded`
broadcast SHALL be emitted, and no exception SHALL propagate to the host page or
to other platforms.

#### Scenario: Self-check passes when anchors resolve

- **WHEN** `selfCheck()` runs against a document where all required anchors resolve
- **THEN** it returns `{ ok: true, missing: [] }`
- **AND** the overlay is allowed to mount

#### Scenario: Self-check fails cleanly when anchors are missing

- **WHEN** `selfCheck()` runs against a document missing one or more required
  anchors
- **THEN** it returns `{ ok: false, missing }` listing the missing anchors
- **AND** the overlay does not mount and a `platform.degraded` broadcast is emitted
- **AND** no exception propagates

### Requirement: Config-driven read operations

The generic adapter SHALL implement conversation detection and reading purely from
the config's selectors: `detectConversation()` returns the active
`ConversationRef` (or `null`), `listConversations()` returns the conversations in
the list, and `readMessages(nativeId)` returns the conversation's `Message[]` in
order, each tagged with its `role`.

#### Scenario: Detect the active conversation

- **WHEN** `detectConversation()` runs on a page showing an open conversation
- **THEN** it returns a `ConversationRef` whose `nativeId`, `title`, and `url`
  come from the configured selectors

#### Scenario: Read ordered, role-tagged messages

- **WHEN** `readMessages(nativeId)` runs for a conversation
- **THEN** it returns the messages in document order
- **AND** each message carries `role` (`user` or `assistant`), `text`, and `order`

### Requirement: Config-driven write operations

The generic adapter SHALL implement composer interaction from the config's
`behaviors`: `getInputElement()` returns the composer element, `insertText(text,
opts)` writes into it using the configured `insertMode`, and `submit()` sends the
message using the configured `submitMode`. Each returns a boolean indicating
success.

#### Scenario: Insert text into the composer

- **WHEN** `insertText("hello")` is called and the composer resolves
- **THEN** the composer's content reflects the inserted text using the configured
  `insertMode`
- **AND** the call returns `true`

#### Scenario: Submit the composed message

- **WHEN** `submit()` is called with a configured `submitMode`
- **THEN** the message is submitted via that mode (`click` the send button or
  `enter`)
- **AND** the call returns `true`

### Requirement: Change observation with disposer

The adapter SHALL provide `observe(onChange)` that emits `AdapterEvent`s
(`conversation-changed`, `list-changed`, `composer-ready`) and returns a disposer
that stops all observation when called.

#### Scenario: Observer receives events and can be disposed

- **WHEN** a caller registers via `observe(onChange)` and the active conversation
  changes
- **THEN** `onChange` receives a `conversation-changed` event
- **AND** after the returned disposer is called, no further events are delivered

### Requirement: Shared adapter contract test harness

The system SHALL provide one shared contract test suite, runnable against any
platform config and a recorded DOM fixture, that asserts the cross-platform
adapter invariants. The fixture format SHALL be documented so any future platform
can be added as a config + fixture passing this same suite.

#### Scenario: Contract suite runs against a reference fixture

- **WHEN** the contract suite is run with a config and its recorded fixture
- **THEN** it exercises `selfCheck`, `detectConversation`, `listConversations`,
  `readMessages`, `getInputElement`, `insertText`, `submit`, and `observe`
- **AND** the suite passes only when all invariants hold against the fixture's
  documented expectations
