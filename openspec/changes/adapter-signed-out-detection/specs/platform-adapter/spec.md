## MODIFIED Requirements

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

## ADDED Requirements

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
