## ADDED Requirements

### Requirement: Recording prompt usage

The worker SHALL accept a `prompt.recordUse` mutation identifying a prompt by id and, for a prompt
that exists and is not a tombstone, SHALL set its `lastUsedAt` to the current time and increment its
`usageCount` by one, persisting through the single-writer store (which stamps the sync envelope).
Recording usage SHALL NOT alter any other prompt field.

#### Scenario: Recording a use stamps the usage fields

- **WHEN** a `prompt.recordUse` mutation is applied for an existing prompt
- **THEN** that prompt's `lastUsedAt` is set to the current time
- **AND** its `usageCount` is increased by one
- **AND** its other fields are unchanged

#### Scenario: Recording a use for a missing prompt is a no-op

- **WHEN** a `prompt.recordUse` mutation targets an id that does not exist or is a tombstone
- **THEN** no prompt is modified

### Requirement: Recently used prompts read

The worker SHALL answer a `prompt.recents` read carrying a `limit` by returning the prompts that
have a recorded `lastUsedAt`, most recently used first, capped at `limit`, each shaped as a
prompt-search result (id, title, a leading snippet, target models, and `slug` when present).
Prompts that have never been used and tombstones SHALL be excluded.

#### Scenario: Recents returns used prompts most-recent first

- **WHEN** several prompts have been used and a `prompt.recents` read with a limit is issued
- **THEN** the result lists only prompts that have a `lastUsedAt`, ordered most-recent first
- **AND** no more than `limit` prompts are returned

#### Scenario: Recents is empty before any use

- **WHEN** no prompt has ever been used and a `prompt.recents` read is issued
- **THEN** the result is empty
