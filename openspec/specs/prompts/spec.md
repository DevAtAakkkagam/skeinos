# prompts Specification

## Purpose

The prompts capability defines the on-device prompt-library data layer: a canonical, syncable `Prompt` metadata record (title, template `body`, parsed `variables`, organizational metadata, a multi-platform target list, an optional slash alias, and dormant usage fields), and the pure template-parsing primitives that derive structured variables and a render-ready token stream from a prompt body. The variable extractor and the tokenizer share a single scan so they never disagree about which `{{…}}` spans are variables.

## Requirements

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

### Requirement: Template variable extraction

The system SHALL provide a pure `parseVariables(body)` function that returns the ordered, deduplicated
list of `PromptVar` declared by `{{…}}` tokens in the body. The function SHALL be total — it MUST never
throw, for any input string. A `{{…}}` token SHALL be recognized as a variable only when its trimmed
inner content has a non-empty name and contains no brace characters.

#### Scenario: Plain variable
- **WHEN** the body contains `{{topic}}`
- **THEN** the result includes `{ name: 'topic', type: 'text' }` with no `default`

#### Scenario: Variable with a default
- **WHEN** the body contains `{{tone = neutral}}`
- **THEN** the result includes `{ name: 'tone', type: 'text', default: 'neutral' }` (name and default
  trimmed)

#### Scenario: Select variable with options
- **WHEN** the body contains `{{audience = devs | execs | general}}`
- **THEN** the result includes `{ name: 'audience', type: 'select', options: ['devs','execs','general'],
  default: 'devs' }` (the first option is the default; option values are trimmed and empty segments are
  dropped)

#### Scenario: Duplicate names coalesce, ordered by first appearance
- **WHEN** the body contains `{{topic}}` before `{{tone}}` and then `{{topic = AI}}` again
- **THEN** the result has exactly two entries, ordered `topic` then `tone`, and `topic` carries
  `default: 'AI'` (the first occurrence fixes order; a later occurrence fills a field the first left
  unset)

#### Scenario: First non-empty field wins on conflict
- **WHEN** the body contains `{{topic = AI}}` and later `{{topic = ML}}`
- **THEN** the single `topic` entry keeps `default: 'AI'`

#### Scenario: Malformed and empty tokens yield no variable
- **WHEN** the body contains any of `{{}}`, `{{   }}`, `{{= x}}`, an unclosed `{{topic`, or a nested
  `{{a{{b}}`
- **THEN** none of these contribute a `PromptVar` (they are treated as literal text)

### Requirement: Template tokenization for rendering

The system SHALL provide a pure `tokenizeTemplate(body)` function that returns the body as an ordered
run of tokens — `text` runs and `var` tokens — derived from the same scan as `parseVariables`, so the
two never disagree about which spans are variables. Each `var` token SHALL expose the variable `name`
and the original `raw` token text. Spans that are not recognized as variables SHALL appear within `text`
tokens.

#### Scenario: Interleaved text and variables
- **WHEN** `tokenizeTemplate` is called on `Hi {{name}}, write about {{topic}}.`
- **THEN** it returns, in order: a `text` token `Hi `, a `var` token for `name`, a `text` token `,
  write about `, a `var` token for `topic`, and a `text` token `.`

#### Scenario: Malformed token stays text
- **WHEN** `tokenizeTemplate` is called on `a {{}} b`
- **THEN** the `{{}}` is part of a `text` token, and no `var` token is emitted

#### Scenario: Tokenizer agrees with the extractor
- **WHEN** both functions run on the same body
- **THEN** the set of distinct `var`-token names from `tokenizeTemplate` equals the set of `name`s from
  `parseVariables`

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

### Requirement: Prompt search query

The system SHALL provide a `prompt.search` selector on the `prompts.query` request that returns the
library's prompts matching all supplied query terms. A prompt SHALL match when every term appears
(case-insensitively, normalized as conversation search normalizes) in at least one of its title, body,
description, tags, or slug. Results SHALL be ranked with title matches outweighing body/description
matches and ties broken by recency, SHALL each carry a highlighted snippet (reusing the search overlay's
snippet-segment shape), and SHALL exclude tombstoned prompts. The search SHALL run entirely on-device
over the local library; prompt content SHALL NOT enter the conversation postings index or the sync
envelope.

#### Scenario: Matches across searchable fields
- **WHEN** a `prompt.search` with terms that appear in a prompt's title, body, tags, or slug is handled
- **THEN** that prompt is included in the results

#### Scenario: AND semantics across terms
- **WHEN** a query has multiple terms
- **THEN** only prompts in which every term appears (in any searchable field) are returned

#### Scenario: Title matches rank above body matches
- **WHEN** one prompt matches a term in its title and another only in its body
- **THEN** the title match is ranked ahead of the body match

#### Scenario: Results carry a highlighted snippet
- **WHEN** a prompt matches
- **THEN** its result carries a snippet whose matching runs are flagged for highlighting

#### Scenario: Tombstoned prompts are excluded
- **WHEN** a deleted (tombstoned) prompt would otherwise match
- **THEN** it does not appear in the results

#### Scenario: Empty query returns nothing
- **WHEN** a `prompt.search` is handled with no terms
- **THEN** it returns an empty result set (not the whole library)

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

### Requirement: Prompt library browsing

The Prompts tab SHALL present the library as a single-column list of prompt cards, read from the worker's
`prompt.library` snapshot and re-read on every `state.changed` broadcast. It SHALL show an honest load
state — never an empty list while a first read is in flight or has failed — and explicit empty states: a
first-run state with a primary "create prompt" action when no prompts exist, and a distinct "no matches"
state when a filter excludes all prompts.

#### Scenario: Cards render from the library
- **WHEN** the library contains prompts
- **THEN** the tab renders one card per prompt, refreshed when the worker broadcasts a change

#### Scenario: First-run empty state
- **WHEN** the library has no prompts
- **THEN** an empty state with a primary action to create the first prompt is shown (not a blank list)

#### Scenario: Load is not shown as empty
- **WHEN** the first library read is in flight or has failed
- **THEN** the tab shows a loading or error state rather than an empty library

### Requirement: Category and tag filtering with client-derived counts

The Prompts tab SHALL offer a category filter (an `All` reset plus one entry per category) and a tag
filter, with each entry's count **derived client-side** from the loaded prompt list (never read from the
worker). Filtering is ephemeral view state — never persisted and never a worker write — and narrows the
visible cards by the selected category AND any selected tags; `All` clears the category narrowing.

#### Scenario: Category counts match the rows
- **WHEN** the library is loaded
- **THEN** each category entry shows a count equal to the number of loaded prompts in that category, and
  `All` shows the total

#### Scenario: Selecting a category narrows the list
- **WHEN** the user selects a category
- **THEN** only prompts in that category are shown, and selecting `All` restores the full list

#### Scenario: Tag filter narrows within the category
- **WHEN** one or more tags are selected
- **THEN** only prompts carrying all selected tags (within the active category) are shown

### Requirement: Prompt card

Each card SHALL show the prompt's title, a body excerpt with `{{variables}}` rendered as highlighted
chips (via the shared tokenizer, so the highlight never disagrees with the parsed variables), the
variable count, the target-platform logos derived from `targetModels`, and the `slug` as an inert badge
when present (no insertion behavior in this slice). Each card SHALL expose an overflow menu to edit or
delete the prompt.

#### Scenario: Variables render as chips
- **WHEN** a prompt body contains `{{topic}}`
- **THEN** the card's body excerpt shows `topic` as a highlighted variable chip, and the card shows the
  variable count

#### Scenario: Target platforms shown as logos
- **WHEN** a prompt declares `targetModels`
- **THEN** the card shows a brand logo for each target platform; a prompt with none shows no platform logo

#### Scenario: Slug badge is inert
- **WHEN** a prompt has a `slug`
- **THEN** the card shows it as a badge that triggers no insertion or navigation in this slice

#### Scenario: Card menu edits or deletes
- **WHEN** the user opens a card's overflow menu and chooses edit or delete
- **THEN** the editor opens for that prompt, or the prompt is deleted after an explicit confirmation

### Requirement: Prompt editor

The tab SHALL provide an editor to create and update a prompt, capturing title, body, description, tags,
target platforms (multi-select), category, and slug. While editing the body it SHALL show a live preview
of the variables parsed from it (name, default, type). On save it SHALL send the body and metadata to the
worker and SHALL NOT send `variables` (the worker derives them). The editor SHALL be keyboard-operable
and dismissable without losing unsaved input unexpectedly.

#### Scenario: Create a prompt
- **WHEN** the user fills the editor and saves a new prompt
- **THEN** a `prompt.create` is sent with the body and metadata (no `variables`), and the new card appears
  after the view reconciles

#### Scenario: Live variable preview
- **WHEN** the user types `{{audience = devs | execs}}` into the body
- **THEN** the editor previews a `select` variable `audience` with options and a default, updating as the
  body changes

#### Scenario: Edit an existing prompt
- **WHEN** the user edits a prompt's body and saves
- **THEN** a `prompt.update` carrying the new body is sent and the card reflects the change after reconcile

#### Scenario: Multi-select target platforms
- **WHEN** the user toggles two target platforms and saves
- **THEN** the saved prompt's `targetModels` contains both, and the card shows both logos

### Requirement: Category management

The tab SHALL let the user create a category (including inline while assigning a prompt), rename a
category, and delete a category. Deleting a category SHALL warn that its prompts become uncategorized
(the worker reassigns them) and SHALL be confirmed before it runs.

#### Scenario: Create and assign a category
- **WHEN** the user creates a new category and assigns a prompt to it
- **THEN** the category appears in the filter with the prompt counted under it

#### Scenario: Delete reassigns to uncategorized
- **WHEN** the user confirms deleting a category that holds prompts
- **THEN** the category is removed and its prompts appear as uncategorized (under `All`, not the deleted
  category)

### Requirement: Prompt library is a pure view over the worker

The Prompts tab SHALL hold no authoritative prompt state of its own: every mutation is sent to the worker
exactly once and the view reconciles by re-reading the library (observe-don't-replay), so a lost
acknowledgement never replays a write and the view converges on the single writer's truth across tabs.

#### Scenario: Reconcile after a mutation
- **WHEN** a create, update, or delete is sent
- **THEN** the view re-reads the library after the attempt and reflects the worker's state, whether or not
  the acknowledgement arrived

#### Scenario: Cross-tab convergence
- **WHEN** another tab changes the library and the worker broadcasts `state.changed`
- **THEN** the Prompts tab re-reads and shows the updated library
