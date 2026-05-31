## ADDED Requirements

### Requirement: Claude adapter config

The system SHALL ship a bundled `AdapterConfig` for Claude (`platformId:
"claude"`) that validates against the `AdapterConfig` schema and matches Claude's
host URLs. Its `behaviors` SHALL reflect Claude's composer (a React-controlled
editor) so the generic adapter inserts and submits correctly without
platform-specific code.

#### Scenario: Bundled Claude config is valid

- **WHEN** the bundled Claude config is validated against the `AdapterConfig`
  schema
- **THEN** validation succeeds
- **AND** `platformId` is `"claude"` and `hostMatch` matches Claude's host

### Requirement: Claude passes the shared contract suite

The Claude config SHALL pass the shared adapter contract suite against recorded
Claude DOM fixtures: detecting the active conversation, listing conversations,
reading ordered role-tagged messages, and operating on the composer.

#### Scenario: Contract suite green on the Claude fixture

- **WHEN** the contract suite runs with the Claude config against the recorded
  Claude fixture
- **THEN** every contract assertion passes

### Requirement: Claude self-check fails cleanly on a broken fixture

The adapter `selfCheck()` SHALL fail cleanly when run against a Claude fixture
with required anchors removed: it MUST report the missing anchors, isolate the
breakage, and MUST NOT throw.

#### Scenario: Broken Claude fixture degrades gracefully

- **WHEN** `selfCheck()` runs against a Claude fixture missing the composer anchor
- **THEN** it returns `{ ok: false, missing }` naming the missing anchor
- **AND** no exception propagates and the overlay does not mount
