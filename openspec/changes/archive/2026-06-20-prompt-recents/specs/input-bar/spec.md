## MODIFIED Requirements

### Requirement: Slash-command popover lists matching prompts

The bar SHALL provide a trigger, labelled "Insert prompt", that opens a popover with its own search
field. When the search field is empty, the popover SHALL list the user's most recently used prompts
(up to five) under a "Last used" heading, selectable through the same flow as search results; when
no prompt has been used yet, it SHALL instead show the "type to search" hint. When the search field
has a query, the popover SHALL query the prompt library and list matches, each row showing the
prompt title, a highlighted snippet, and its `/slug` alias. Closing the popover SHALL return focus
appropriately and SHALL NOT insert anything.

#### Scenario: Empty state lists last-used prompts

- **WHEN** the user opens the popover with an empty search field and has previously used prompts
- **THEN** up to five most-recently-used prompts are listed under a "Last used" heading
- **AND** they are navigable and selectable exactly like search results

#### Scenario: Empty state with no usage shows the hint

- **WHEN** the user opens the popover with an empty search field and has never used a prompt
- **THEN** the "type to search your prompts" hint is shown and no rows are listed

#### Scenario: Typing switches to search results

- **WHEN** the user types a query into the popover
- **THEN** the last-used list is replaced by prompts matching the query

#### Scenario: No matches

- **WHEN** the query matches no prompts
- **THEN** the popover shows an explicit empty state and inserts nothing

#### Scenario: Dismissing the popover inserts nothing

- **WHEN** the user dismisses the popover without selecting a prompt
- **THEN** the popover closes and the composer is unchanged

## ADDED Requirements

### Requirement: Inserting a prompt records its use

When a prompt is inserted from the popover, the bar SHALL record a use of that prompt so it surfaces
in the "Last used" list, both for a prompt inserted directly and for one completed through the
variable-fill modal. Cancelling the variable-fill modal SHALL NOT record a use. Recording a use
SHALL NOT block or delay insertion.

#### Scenario: Direct insertion records a use

- **WHEN** the user selects a prompt with no variables and it is inserted
- **THEN** a use of that prompt is recorded

#### Scenario: Variable-modal confirmation records a use

- **WHEN** the user selects a prompt with variables, fills the modal, and confirms
- **THEN** a use of that prompt is recorded

#### Scenario: Cancelling the variable modal records nothing

- **WHEN** the user selects a prompt with variables and cancels the modal
- **THEN** no use is recorded and nothing is inserted
