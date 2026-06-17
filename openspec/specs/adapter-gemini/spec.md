# adapter-gemini Specification

## Purpose

The adapter-gemini capability defines the bundled Gemini platform integration built entirely on the generic config-driven adapter: a schema-valid `AdapterConfig` for Gemini that drives its Quill `contenteditable` composer with no platform-specific code, validation that the config passes the shared adapter contract suite against recorded Gemini DOM fixtures, and confirmation that `selfCheck()` degrades cleanly (reporting missing anchors without throwing) when run against a broken Gemini fixture.

## Requirements

### Requirement: Gemini adapter config

The system SHALL ship a bundled `AdapterConfig` for Gemini (`platformId:
"gemini"`) that validates against the `AdapterConfig` schema and matches Gemini's
host URLs (`*://gemini.google.com/*`). It SHALL be registered in `BUNDLED_CONFIGS`
so the host router selects it on Gemini tabs. Its `behaviors` SHALL reflect
Gemini's Quill `contenteditable` composer (`insertMode: "execCommand"`,
`submitMode: "click"`, `supportsSystemPrompt: false`) so the generic adapter
inserts and submits correctly without platform-specific code. Its selectors SHALL
use only framework-stable hooks (custom-element tags, `aria-label`s,
`data-test-id`s, `href` prefixes) and MUST NOT depend on Angular-generated CSS
classes.

#### Scenario: Bundled Gemini config is valid

- **WHEN** the bundled Gemini config is validated against the `AdapterConfig`
  schema
- **THEN** validation succeeds
- **AND** `platformId` is `"gemini"` and `hostMatch` matches Gemini's host

#### Scenario: Host router resolves Gemini

- **WHEN** `matchPlatform("https://gemini.google.com/app/abc123")` is called
- **THEN** it returns `"gemini"`

### Requirement: Gemini passes the shared contract suite

The Gemini config SHALL pass the shared adapter contract suite against recorded
Gemini DOM fixtures: detecting the active conversation by its `aria-current`
anchor, listing conversations via `a[href^="/app/"]` (excluding the "New chat"
entry), reading ordered role-tagged messages from `user-query`/`model-response`,
and inserting text into the `.ql-editor` composer.

#### Scenario: Contract suite green on the Gemini fixture

- **WHEN** the contract suite runs with the Gemini config against the recorded
  Gemini fixture
- **THEN** every contract assertion passes

#### Scenario: Active conversation resolves to its /app id

- **WHEN** `detectConversation()` runs against the Gemini fixture whose open
  anchor carries `aria-current="page"`
- **THEN** it returns the conversation whose `nativeId` is that anchor's
  `/app/<id>` href

### Requirement: Gemini self-check fails cleanly on a broken fixture

The adapter `selfCheck()` SHALL fail cleanly when run against a Gemini fixture
with required anchors removed: it MUST report the missing anchors, isolate the
breakage, and MUST NOT throw.

#### Scenario: Broken Gemini fixture degrades gracefully

- **WHEN** `selfCheck()` runs against a Gemini fixture missing the composer anchor
- **THEN** it returns `{ ok: false, missing }` naming the missing anchor
- **AND** no exception propagates and the overlay does not mount
