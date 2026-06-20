## ADDED Requirements

### Requirement: Prompt library read

The system SHALL provide a `prompts.query` request with a `prompt.library` selector that returns the
unified prompt library as `{ prompts: Prompt[]; folders: PromptFolder[] }` — every prompt and every
category, regardless of platform or category. The worker SHALL NOT return derived counts; category and
tag counts are computed by the caller from the returned `prompts`. The read SHALL exclude tombstoned
records.

#### Scenario: Library read returns prompts and categories
- **WHEN** a `prompts.query` with selector `prompt.library` is handled
- **THEN** it returns all non-deleted prompts and all non-deleted prompt categories, with no count fields

#### Scenario: Empty library
- **WHEN** no prompts or categories exist
- **THEN** the read returns `{ prompts: [], folders: [] }` (not an error)

### Requirement: Prompt creation derives variables from the body

The system SHALL handle a `prompt.create` mutation that persists a new `Prompt` from a client-supplied id
and fields (`title`, `body`, optional `description`, `tags`, `targetModels`, `slug`, `promptFolderId`).
The worker SHALL derive `variables` by parsing the `body`, initialize `usageCount` to 0, and persist
through the repo (stamping the sync envelope). The client SHALL NOT supply `variables`.

#### Scenario: Create parses variables and persists
- **WHEN** a `prompt.create` arrives with body `Write about {{topic}} for {{audience = devs | execs}}`
- **THEN** the stored prompt has `variables` equal to the parser's output for that body (a text `topic`
  and a select `audience`), `usageCount` 0, and the supplied metadata

#### Scenario: Create broadcasts the prompts store
- **WHEN** a `prompt.create` succeeds
- **THEN** the worker broadcasts `state.changed` including the `prompts` store

### Requirement: Prompt update is a partial patch and re-derives variables on body change

The system SHALL handle a `prompt.update` mutation carrying an `id` and any subset of the editable fields,
applied as a read-modify-write over the stored prompt. When the patch includes a new `body`, the worker
SHALL re-derive `variables` from it; otherwise `variables` is left unchanged. The dormant `usageCount` and
`lastUsedAt` fields SHALL be preserved. Updating a non-existent id SHALL fail with a `notFound` error.

#### Scenario: Body change re-derives variables
- **WHEN** an existing prompt is updated with a new `body`
- **THEN** its `variables` are recomputed from the new body and the unchanged fields are preserved

#### Scenario: Metadata-only update leaves variables and usage intact
- **WHEN** a prompt is updated with only `title` and `tags` (no `body`)
- **THEN** its `variables`, `usageCount`, and `lastUsedAt` are unchanged

#### Scenario: Update of a missing prompt fails
- **WHEN** a `prompt.update` targets an id that does not exist
- **THEN** the mutation fails with a `notFound` error and writes nothing

### Requirement: Prompt deletion

The system SHALL handle a `prompt.delete` mutation that removes a prompt by id (writing a tombstone, since
prompts are syncable) and broadcasts the `prompts` store change.

#### Scenario: Delete tombstones and broadcasts
- **WHEN** a `prompt.delete` targets an existing prompt
- **THEN** the prompt no longer appears in a `prompt.library` read, and `state.changed` includes `prompts`

### Requirement: Prompt category management

The system SHALL handle `promptFolder.create` (client-supplied id, `name`, `order`, flat `parentId` of
`null`), `promptFolder.rename`, and `promptFolder.delete`. Deleting a category SHALL reassign every prompt
whose `promptFolderId` matched it to `null`, so no prompt is left referencing a removed category.

#### Scenario: Create and rename a category
- **WHEN** a `promptFolder.create` then a `promptFolder.rename` are handled for the same id
- **THEN** a `prompt.library` read returns the category with its new name

#### Scenario: Deleting a category reassigns its prompts to uncategorized
- **WHEN** a category holding two prompts is deleted
- **THEN** the category is removed and both prompts now have `promptFolderId` of `null`, and the broadcast
  includes both the `promptFolders` and `prompts` stores

#### Scenario: Deleting an empty category touches only categories
- **WHEN** a category with no prompts is deleted
- **THEN** the broadcast includes the `promptFolders` store and not the `prompts` store

### Requirement: Prompt mutations run in the single writer and broadcast on change

The system SHALL handle all prompt and category mutations in the service worker (the single writer),
rebuilding from the repos on each call with no in-memory state, and SHALL broadcast `state.changed` with
the touched store names after any write that changed data. A mutation that changed nothing SHALL skip the
broadcast.

#### Scenario: Cold worker answers without prior in-memory state
- **WHEN** the worker handles a `prompts.query` or `prompts.mutate` immediately after a cold start
- **THEN** it serves the request from the repos without requiring any rehydration step

#### Scenario: No broadcast when nothing changed
- **WHEN** a mutation results in no store write
- **THEN** no `state.changed` broadcast is emitted
