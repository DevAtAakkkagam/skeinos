# platform-adapter Specification

## Purpose

The platform-adapter capability defines the single, config-driven contract between the rest of the system and any LLM chat site: one generic adapter built from a per-platform `AdapterConfig`, exposing the `PlatformAdapter` interface (LLD §4.1) as the only platform-facing contract. It covers schema-validated config, a config loader with a bundled offline fallback that never loads remote code, self-check breakage isolation, config-driven read and write operations, change observation with a disposer, and a shared contract test harness that any future platform passes as a config + recorded DOM fixture.

## Requirements

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
and `behaviors.submitMode` MUST be members of their enums. The schema SHALL accept
an **optional** `authedMarker` selector string; when present it MUST be a non-empty
string, and when absent the platform is never classified signed-out (today's
behavior).

#### Scenario: Valid config passes validation

- **WHEN** a config containing all required fields with correct types is validated
- **THEN** validation succeeds and returns the typed `AdapterConfig`

#### Scenario: Optional authedMarker is accepted

- **WHEN** a config carries an `authedMarker` non-empty string selector
- **THEN** validation succeeds and the typed `AdapterConfig` exposes `authedMarker`
- **AND** a config that omits `authedMarker` still validates

#### Scenario: Malformed config is rejected

- **WHEN** a config is missing a required selector, carries an unknown
  `platformId`, has a non-semver `configVersion`, uses an invalid behavior enum, or
  supplies an empty-string `authedMarker`
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
are missing the overlay SHALL NOT fully mount for that platform, and no exception
SHALL propagate to the host page or to other platforms. A failing `selfCheck()`
SHALL NOT unconditionally emit `platform.degraded` or mount the breakage banner;
those reactions are governed by the signed-out classification requirement, so a
signed-out page never raises a breakage signal.

#### Scenario: Self-check passes when anchors resolve

- **WHEN** `selfCheck()` runs against a document where all required anchors resolve
- **THEN** it returns `{ ok: true, missing: [] }`
- **AND** the overlay is allowed to mount

#### Scenario: Self-check fails cleanly when anchors are missing

- **WHEN** `selfCheck()` runs against a document missing one or more required
  anchors
- **THEN** it returns `{ ok: false, missing }` listing the missing anchors
- **AND** the overlay does not fully mount
- **AND** no exception propagates
- **AND** whether `platform.degraded` is emitted is decided by the signed-out
  classification, not by `selfCheck()` itself

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
(`conversation-changed`, `list-changed`, `composer-ready`) and returns a disposer that stops all
observation when called. It SHALL emit `composer-ready` when the composer first becomes available
and SHALL re-emit `composer-ready` whenever the composer element is replaced by a new element
(e.g. on single-page-app navigation), so an overlay anchored to the composer can re-attach.

#### Scenario: Observer receives events and can be disposed

- **WHEN** a caller registers via `observe(onChange)` and the active conversation changes
- **THEN** `onChange` receives a `conversation-changed` event
- **AND** after the returned disposer is called, no further events are delivered

#### Scenario: composer-ready re-emits when the composer element is replaced

- **WHEN** the host replaces the composer element with a new element while an observer is registered
- **THEN** `onChange` receives a further `composer-ready` event for the new composer

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

### Requirement: Capability-tiered signed-out classification

When `selfCheck()` fails, the system SHALL classify the failure before reacting,
using two named anchor tiers — `COMPOSE` = (`composer`, `inputBarAnchor`) and
`WORKSPACE` = (`conversationList`, `sidebarAnchor`) — together with the optional
`authedMarker` selector, as follows:

- If `authedMarker` resolves in the document → classify as **breakage** (the app
  shell is signed in but an anchor is genuinely missing): the overlay does not
  mount, `platform.degraded` is reported, and the breakage banner is raised.
- Else if the `COMPOSE` tier resolves → classify as **signed-out, compose-only**:
  the input bar SHALL mount, history ingest/filing and the workspace path SHALL be
  skipped, and no breakage banner SHALL be shown.
- Else → classify as **signed-out, dormant**: the script stays quiet with no
  overlay and no banner.

When `authedMarker` is absent from the config, the platform SHALL be treated as in
the **breakage** branch on a failing `selfCheck()` (preserving today's behavior).
The classification SHALL fail quiet: when `authedMarker` does not resolve, the
system SHALL NOT raise a breakage banner even if some anchors are missing.

#### Scenario: Signed-in page with a missing anchor is breakage

- **WHEN** `selfCheck()` fails and the configured `authedMarker` resolves in the document
- **THEN** the breakage banner is mounted and the platform is reported degraded

#### Scenario: Signed-out page with a usable composer activates compose-only

- **WHEN** `selfCheck()` fails, `authedMarker` does not resolve, and the `COMPOSE`
  tier (`composer` + `inputBarAnchor`) resolves
- **THEN** the input bar is mounted
- **AND** no breakage banner is shown and no history ingest is performed

#### Scenario: Signed-out page with no composer stays dormant

- **WHEN** `selfCheck()` fails, `authedMarker` does not resolve, and the `COMPOSE`
  tier does not resolve
- **THEN** no overlay and no breakage banner are mounted

#### Scenario: Config without authedMarker preserves legacy behavior

- **WHEN** `selfCheck()` fails for a platform whose config has no `authedMarker`
- **THEN** the failure is classified as breakage (banner + degraded), as before

### Requirement: waitForSelfCheck early-exits on a confident signed-out read

The hydration-grace probe (`waitForSelfCheck`) SHALL also evaluate `authedMarker`
on each probe. When anchors are still failing but `authedMarker` is reliably absent
and the page has settled (the `COMPOSE` tier resolved, or a short settle window
elapsed), it SHALL resolve to the signed-out classification promptly rather than
waiting the full anchor timeout. It SHALL still never reject, and SHALL still return
the final anchor result for the breakage path.

#### Scenario: Confident signed-out resolves before the full timeout

- **WHEN** anchors keep failing, `authedMarker` is absent, and the `COMPOSE` tier
  has resolved
- **THEN** `waitForSelfCheck` resolves to the signed-out path without waiting the
  full anchor timeout

#### Scenario: Ambiguous mid-hydration page still waits

- **WHEN** anchors are failing, `authedMarker` is absent, and neither the `COMPOSE`
  tier has resolved nor the settle window has elapsed
- **THEN** `waitForSelfCheck` keeps probing until anchors pass or the timeout fires

### Requirement: Adapter selectors are language-independent

Adapter config selectors (including `authedMarker`) SHALL NOT depend on visible
text, `aria-label` attribute values, or assumed authentication/route URLs. They
SHALL prefer `data-testid`, then a stable `id` or structural attribute. Conversation
`href`-prefix selectors that encode the conversation identity model (e.g.
`a[href^="/c/"]`, `a[href^="/chat/"]`, `a[href^="/search/"]`) are explicitly
allowed, as they identify conversations rather than assume navigation URLs. A guard
test SHALL run over every shipped config and fail if any selector contains an
`[aria-label="…"]` term, a text/`:contains()` match, or an assumed auth/route URL.

#### Scenario: A config with an aria-label selector fails the guard

- **WHEN** the guard test runs over a config whose selector matches on
  `aria-label="…"` or visible text
- **THEN** the guard test fails, naming the offending platform and selector

#### Scenario: Shipped configs pass the guard

- **WHEN** the guard test runs over the bundled ChatGPT, Claude, Gemini, and
  Perplexity configs after this change
- **THEN** every selector is text/`aria-label`/auth-URL-free and the guard passes
