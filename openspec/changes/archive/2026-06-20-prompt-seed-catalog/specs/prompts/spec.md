## MODIFIED Requirements

### Requirement: Prompt data model

The system SHALL define a canonical `Prompt` record carrying its title, template `body`, the parsed
`variables`, organizational metadata (`tags`, `promptFolderId`), a multi-platform target list
(`targetModels`), an optional slash alias (`slug`), an optional `domain` of type `DomainId`, an
optional `seedId` recording catalog provenance, and dormant usage fields (`usageCount`,
`lastUsedAt`). A `Prompt` SHALL be a syncable metadata record (it carries the sync envelope). The
per-variable shape `PromptVar` SHALL carry `name`, an optional `default`, a `type` of `text` or
`select`, and optional `options`.

#### Scenario: Target platforms are a list
- **WHEN** a `Prompt` declares the platforms it targets
- **THEN** the value is a list `targetModels: PlatformId[]` (zero or more platforms), not a single
  optional platform

#### Scenario: Slash alias is optional and inert
- **WHEN** a `Prompt` is created without a `slug`
- **THEN** the record is valid with no alias, and the `slug` field carries no behavior in this slice
  (it is consumed only once insertion ships)

#### Scenario: Usage fields exist but are dormant
- **WHEN** a `Prompt` is created
- **THEN** `usageCount` and `lastUsedAt` are part of the model and are not mutated by parsing or by this
  slice

#### Scenario: Domain and seed provenance are optional
- **WHEN** a hand-created `Prompt` is created without a `domain` or `seedId`
- **THEN** the record is valid with both fields absent
- **AND** a prompt installed from the catalog carries a `domain` of type `DomainId` and the
  originating `seedId`
