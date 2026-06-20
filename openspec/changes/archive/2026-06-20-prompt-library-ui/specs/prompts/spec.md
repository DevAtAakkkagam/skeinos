## ADDED Requirements

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
