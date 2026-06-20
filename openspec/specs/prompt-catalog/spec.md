# prompt-catalog Specification

## Purpose

The prompt-catalog capability defines the bundled, read-only starter-prompt catalog and the domain registry that organizes it, plus the idempotent installer that copies a domain's seed prompts into the on-device prompt library. The catalog ships as bundle data and is never written to the workspace store on import; installation runs in the service worker (the single writer), derives variables from each seed body, and broadcasts only when prompts are actually inserted.

## Requirements

### Requirement: Domain registry

The system SHALL define a `DomainId` union and a single ordered `DOMAIN_REGISTRY` listing every
supported domain with a stable `id` and a human display `label`. The registry SHALL be the only
source of truth for which domains exist and their order, consumed by both the catalog and any
future onboarding picker. The initial registry SHALL contain exactly four domains:
`software-engineering`, `marketing-content`, `data-analytics`, and `education-research`.

#### Scenario: Registry enumerates the four domains in order
- **WHEN** code reads `DOMAIN_REGISTRY`
- **THEN** it yields four entries with ids `software-engineering`, `marketing-content`,
  `data-analytics`, `education-research`, each carrying a non-empty `label`
- **AND** every entry `id` is a member of the `DomainId` union

### Requirement: Bundled starter-prompt catalog

The system SHALL ship a read-only catalog of starter prompts as bundle data that is never written
to the workspace store on import. The catalog SHALL provide exactly five `SeedPrompt` entries for
each domain in `DOMAIN_REGISTRY` (20 total for the initial four domains). Each `SeedPrompt` SHALL
carry a `seedId`, a `domain` of type `DomainId`, a `title`, a template `body`, and optional
authored metadata (`description`, `tags`, `targetModels`, `slug`) — and SHALL NOT carry a derived
`variables` array, a `promptFolderId`, usage fields, an `id`, or a sync envelope (those are the
installer's responsibility).

#### Scenario: Five seeds per domain
- **WHEN** the catalog is grouped by `domain`
- **THEN** every domain in `DOMAIN_REGISTRY` has exactly five `SeedPrompt` entries
- **AND** the total entry count equals five times the number of registry domains

#### Scenario: Every seedId is unique and domain-scoped
- **WHEN** the catalog entries are enumerated
- **THEN** all `seedId` values are unique across the whole catalog
- **AND** each entry's `domain` is a member of `DomainId`

#### Scenario: Every seed body parses to a valid variable set
- **WHEN** `parseVariables` is run over each `SeedPrompt.body`
- **THEN** the call returns without throwing for every seed
- **AND** any `{{…}}` tokens in the body yield well-formed `PromptVar` entries

### Requirement: Idempotent domain seed installation

The system SHALL provide `installSeeds(store, domain)` that copies the catalog's prompts for a
single `domain` into the workspace store as ordinary `Prompt` records. Each installed record SHALL
derive its `variables` via `parseVariables(body)`, set `promptFolderId` to `null` (uncategorized),
initialize `usageCount` to `0`, carry the originating `seedId` and `domain`, receive a freshly
minted `id`, and be stamped with the sync envelope by the repository on write. The installer SHALL
be idempotent: it SHALL skip any catalog entry whose `seedId` is already present among stored
prompts, and SHALL NOT modify or remove prompts that lack a `seedId`. The installer SHALL return
the number of prompts it inserted.

#### Scenario: Installing a domain inserts its five seeds
- **WHEN** `installSeeds(store, 'software-engineering')` runs against a store with no seeded prompts
- **THEN** five new `Prompt` records exist, each with `domain` `software-engineering`, a populated
  `seedId`, `promptFolderId` `null`, `usageCount` `0`, and derived `variables`
- **AND** the call returns `5`

#### Scenario: Re-running the same domain installs nothing
- **WHEN** `installSeeds(store, 'software-engineering')` runs a second time
- **THEN** no additional prompts are created
- **AND** the call returns `0`

#### Scenario: Installing a second domain leaves the first untouched
- **WHEN** `installSeeds(store, 'marketing-content')` runs after a software-engineering install
- **THEN** the five software-engineering prompts remain unchanged
- **AND** five new marketing-content prompts are added
- **AND** the call returns `5`

#### Scenario: User-authored prompts are never touched
- **WHEN** a store contains a user-created prompt with no `seedId` and `installSeeds` runs for any domain
- **THEN** the user prompt is neither modified nor deleted
- **AND** only catalog seeds for that domain are added

### Requirement: Seed install runs in the single writer and broadcasts on change

The seed install SHALL be performed by the service worker (the single writer) in response to a
typed `prompts.install` request carrying the target `domain`, and SHALL broadcast a
`state.changed` for the `prompts` store only when at least one prompt was inserted. The response
SHALL report the installed count.

#### Scenario: Install request returns the count and broadcasts when prompts are added
- **WHEN** a `prompts.install` request for a domain with no already-installed seeds is handled
- **THEN** the worker installs that domain's five prompts and replies with count `5`
- **AND** a `state.changed` broadcast naming `prompts` is emitted

#### Scenario: A no-op install does not broadcast
- **WHEN** a `prompts.install` request runs for a domain whose seeds are all already present
- **THEN** the reply count is `0`
- **AND** no `state.changed` broadcast is emitted
