## ADDED Requirements

### Requirement: ChatGPT adapter config

The system SHALL ship a bundled `AdapterConfig` for ChatGPT (`platformId:
"chatgpt"`) that validates against the `AdapterConfig` schema and matches
ChatGPT's host URLs (`*://chatgpt.com/*`). It SHALL be registered in
`BUNDLED_CONFIGS` so the host router selects it on ChatGPT tabs. Its `behaviors`
SHALL reflect ChatGPT's ProseMirror `contenteditable` composer (`insertMode:
"execCommand"`, `submitMode: "click"`, `supportsSystemPrompt: false`) and SHALL
set `listHiddenWhenCollapsed: true` because ChatGPT removes its conversation-list
nav from the DOM when the sidebar is collapsed. Its selectors SHALL prefer
framework-stable hooks (the `#prompt-textarea` id, `data-message-author-role`
attributes, `aria-label`s, `href` prefixes, `data-testid`s) over volatile utility
classes wherever a stable hook exists.

#### Scenario: Bundled ChatGPT config is valid

- **WHEN** the bundled ChatGPT config is validated against the `AdapterConfig`
  schema
- **THEN** validation succeeds
- **AND** `platformId` is `"chatgpt"` and `hostMatch` contains `*://chatgpt.com/*`

#### Scenario: Host router resolves ChatGPT

- **WHEN** `matchPlatform("https://chatgpt.com/c/abc123")` is called
- **THEN** it returns `"chatgpt"`

### Requirement: ChatGPT passes the shared contract suite

The ChatGPT config SHALL pass the shared adapter contract suite against recorded
ChatGPT DOM fixtures: detecting the active conversation by its `aria-current`
anchor, listing conversations via `a[href^="/c/"]`, reading ordered role-tagged
messages from `data-message-author-role="user"`/`"assistant"`, and inserting text
into the `#prompt-textarea` composer.

#### Scenario: Contract suite green on the ChatGPT fixture

- **WHEN** the contract suite runs with the ChatGPT config against the recorded
  ChatGPT fixture
- **THEN** every contract assertion passes

#### Scenario: Active conversation resolves to its /c id

- **WHEN** `detectConversation()` runs against the ChatGPT fixture whose open
  anchor carries `aria-current="page"`
- **THEN** it returns the conversation whose `nativeId` is that anchor's
  `/c/<id>` href
- **AND** its title is read from the anchor's `.truncate` child text

### Requirement: ChatGPT is offered as a cross-platform target

Once the ChatGPT adapter has shipped, the system SHALL offer ChatGPT in every
picker that enumerates shipped platforms — the prompt-target multi-select and the
profile-scope apply-to set — and SHALL render ChatGPT's brand logo wherever target
platforms are shown. The set these pickers offer SHALL derive from a single
platform registry (`SUPPORTED_PLATFORMS` in `shared/branding`), not a per-surface
hardcoded list, so flipping a platform to supported surfaces it in every picker at
once and there is no second list to drift out of sync.

#### Scenario: ChatGPT appears in the prompt-target picker

- **WHEN** the prompt editor renders its target-platform toggles
- **THEN** ChatGPT is offered as a selectable target
- **AND** selecting it persists `"chatgpt"` in the prompt's `targetModels`

#### Scenario: ChatGPT appears in the profile-scope picker

- **WHEN** the profile editor renders its apply-to platform rows
- **THEN** ChatGPT is offered as a platform a profile can apply to

#### Scenario: ChatGPT brand logo renders for a ChatGPT target

- **WHEN** a card or picker shows a ChatGPT target platform
- **THEN** the ChatGPT brand logo renders (from `PLATFORM_LOGOS["chatgpt"]`)
  rather than a missing-mark placeholder

### Requirement: ChatGPT self-check fails cleanly on a broken fixture

The adapter `selfCheck()` SHALL fail cleanly when run against a ChatGPT fixture
with required anchors removed: it MUST report the missing anchors, isolate the
breakage, and MUST NOT throw.

#### Scenario: Broken ChatGPT fixture degrades gracefully

- **WHEN** `selfCheck()` runs against a ChatGPT fixture missing the composer
  anchor
- **THEN** it returns `{ ok: false, missing }` naming the missing anchor
- **AND** no exception propagates and the overlay does not mount
