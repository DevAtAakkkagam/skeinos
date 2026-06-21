## MODIFIED Requirements

### Requirement: Slash-command popover lists matching prompts

The bar SHALL provide a trigger, **labelled "Insert prompt"**, that opens a popover with its own
search field. The popover SHALL query the prompt library and list matches, each row showing the
prompt title, a highlighted snippet, and its `/slug` alias. Closing the popover SHALL return focus
appropriately and SHALL NOT insert anything.

#### Scenario: Opening the popover and searching

- **WHEN** the user activates the "Insert prompt" trigger and types a query
- **THEN** the popover lists prompts matching the query
- **AND** each row shows the prompt's title, a snippet, and its `/slug` alias

#### Scenario: Trigger shows a legible label

- **WHEN** the input action bar is shown
- **THEN** the prompt-picker trigger displays the text "Insert prompt"
- **AND** its accessible name matches its visible label

#### Scenario: No matches

- **WHEN** the query matches no prompts
- **THEN** the popover shows an explicit empty state and inserts nothing

#### Scenario: Dismissing the popover inserts nothing

- **WHEN** the user dismisses the popover without selecting a prompt
- **THEN** the popover closes and the composer is unchanged

## ADDED Requirements

### Requirement: Keyboard accelerator toggles the prompt popover

The bar SHALL register a fixed keyboard accelerator, **`Cmd/Ctrl + /`**, that toggles its
slash-command popover while the bar is mounted. The accelerator SHALL prevent the host page from
also acting on the chord, SHALL open the popover (focusing its search field) when closed and close
it when open, and SHALL be disposed together with the bar. It is a single chord and SHALL NOT
inspect or capture the user's composer typing.

#### Scenario: Accelerator opens the popover

- **WHEN** the user presses `Cmd/Ctrl + /` while the bar is mounted and the popover is closed
- **THEN** the popover opens and its search field is focused
- **AND** the host page does not act on the chord

#### Scenario: Accelerator closes the open popover

- **WHEN** the user presses `Cmd/Ctrl + /` while the popover is open
- **THEN** the popover closes and nothing is inserted

#### Scenario: Accelerator is removed with the bar

- **WHEN** the bar is torn down (context invalidation or self-check failure)
- **THEN** the accelerator no longer responds to the chord
