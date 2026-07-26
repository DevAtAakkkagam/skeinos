## MODIFIED Requirements

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

The config SHALL additionally set `historyExpansion: { mode: "scroll" }`, because ChatGPT paginates
its sidebar: it renders roughly 28 conversations at a time and fetches the next page only when its
scroll container reaches the end, so without a sweep the majority of a user's history is never
visible to `listConversations()`. ChatGPT's list is append-only — already-loaded rows accumulate and
are never recycled — so a single sweep is sufficient and permanent.

#### Scenario: Bundled ChatGPT config is valid

- **WHEN** the bundled ChatGPT config is validated against the `AdapterConfig`
  schema
- **THEN** validation succeeds
- **AND** `platformId` is `"chatgpt"` and `hostMatch` contains `*://chatgpt.com/*`

#### Scenario: Host router resolves ChatGPT

- **WHEN** `matchPlatform("https://chatgpt.com/c/abc123")` is called
- **THEN** it returns `"chatgpt"`

#### Scenario: ChatGPT enables the scroll history sweep

- **WHEN** the bundled ChatGPT config is loaded
- **THEN** its `behaviors.historyExpansion.mode` is `"scroll"`
- **AND** an adapter built from it performs a sweep when `expandHistory()` is called

## ADDED Requirements

### Requirement: ChatGPT's paginated list is swept to completion on its fixture

The ChatGPT contract coverage SHALL include a fixture that paginates: it renders an initial page of
conversation rows and appends further pages as its scroll container is driven to the end, without
removing previously-rendered rows. Running `expandHistory()` against that fixture SHALL load every
row, and `listConversations()` SHALL then return the fixture's full conversation set.

#### Scenario: Sweep loads every page of the paginating fixture

- **WHEN** `expandHistory()` runs against the paginating ChatGPT fixture whose initial page shows
  fewer rows than the fixture's total
- **THEN** the sweep completes by plateau
- **AND** `listConversations()` returns every conversation in the fixture with its correct
  `nativeId` and title

#### Scenario: Rows are not recycled during the sweep

- **WHEN** the sweep runs against the paginating ChatGPT fixture
- **THEN** the number of distinct conversation ids observed across all rounds equals the final
  rendered row count, confirming the append-only assumption the backfill relies on
