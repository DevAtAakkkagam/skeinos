# input-bar Specification

## Purpose

The input-bar capability defines the in-context way to use a saved prompt without leaving the chat:
an input action bar docked as a shadow-DOM overlay above the host composer on a supported platform.
It covers the bar's lifecycle (mount on a ready adapter, re-anchor when the composer is replaced,
teardown on context invalidation), a slash-command popover that searches the prompt library, a
variable-fill modal that completes a prompt's `{{variables}}` before insertion, adapter-driven
append-only insertion that never auto-submits, and disabled stubs that reserve layout for the
deferred profile and model-selection controls.
## Requirements
### Requirement: Input action bar docks above the host composer

The input action bar SHALL mount as a shadow-DOM overlay at the adapter's `inputBar` mount point on
a supported host once the adapter self-check passes, styling itself only from theme tokens. It
SHALL NOT mount when the self-check fails, and it SHALL be torn down when the extension context is
invalidated.

#### Scenario: Bar mounts on a ready adapter

- **WHEN** the content script's adapter self-check passes on a supported host
- **THEN** the input action bar is mounted at the adapter's `inputBar` mount point
- **AND** it is styled from the active theme tokens inside its own shadow root

#### Scenario: Bar does not mount on a failed self-check

- **WHEN** the adapter self-check fails
- **THEN** the input action bar is not mounted

#### Scenario: Bar is torn down on context invalidation

- **WHEN** the extension context becomes invalid
- **THEN** the input action bar and any open popover or modal are disposed

### Requirement: Bar re-anchors when the composer is replaced

The input action bar SHALL re-anchor itself to the current composer when the host replaces the
composer element (e.g. on single-page-app navigation), so it does not become orphaned. It SHALL
dispose the previous mount and mount into the fresh anchor, and SHALL remain a single bar (never
duplicated).

#### Scenario: Navigation that swaps the composer re-mounts the bar

- **WHEN** the host replaces the composer element while the bar is mounted
- **THEN** the bar disposes its previous mount and re-mounts at the new `inputBar` anchor
- **AND** exactly one input action bar is present

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

### Requirement: Variable-fill modal completes a prompt before insertion

When the user selects a prompt that contains `{{variables}}`, the bar SHALL open a modal pre-filled
with each variable's default value, with an input per variable appropriate to its parsed type
(text or select). Confirming SHALL produce the prompt body with the entered values substituted. A
prompt with no variables SHALL skip the modal.

#### Scenario: Selecting a prompt with variables opens a pre-filled modal

- **WHEN** the user selects a prompt that declares variables
- **THEN** a modal opens with one input per variable pre-filled with its default
- **AND** confirming substitutes the entered values into the prompt body

#### Scenario: Selecting a prompt with no variables skips the modal

- **WHEN** the user selects a prompt that declares no variables
- **THEN** no modal is shown
- **AND** the prompt body is used directly

### Requirement: Insertion is adapter-driven, append-only, and never auto-submits

The completed prompt text SHALL be inserted into the host composer through the adapter's
`insertText`, appended without clearing an existing draft, and the bar SHALL NOT submit the message
on the user's behalf.

#### Scenario: Chosen prompt is inserted into the composer

- **WHEN** a prompt (filled if it had variables) is confirmed
- **THEN** its text is inserted into the host composer via the adapter
- **AND** any existing composer draft is preserved
- **AND** the message is not submitted automatically

### Requirement: Deferred controls render as disabled stubs

The bar SHALL reserve layout for the not-yet-built model-selection control by rendering it as a
visibly disabled stub, so the bar's layout does not reflow when that feature is added later. The
profile control SHALL be functional (see the Profile chip requirement) and is no longer a stub.

#### Scenario: Model control appears disabled

- **WHEN** the input action bar is shown
- **THEN** the model-selection control is present but disabled

#### Scenario: Profile control is interactive

- **WHEN** the input action bar is shown
- **THEN** the profile control is interactive (not a disabled stub)

### Requirement: Profile chip lists profiles and marks the active one

The bar SHALL provide a Profile chip that opens a menu listing the saved instruction profiles and
indicates which profile is currently active. The active profile SHALL be read from the persisted
global active-profile preference, so the chip reflects the same active profile across tabs and after
a reload.

#### Scenario: Menu lists profiles and shows the active one

- **WHEN** the user opens the Profile chip
- **THEN** the saved profiles are listed
- **AND** the currently active profile is indicated

#### Scenario: Active profile persists across reload

- **WHEN** a profile has been activated
- **AND** the bar is re-rendered (e.g. another tab or after a reload)
- **THEN** the chip shows that profile as active

### Requirement: Selecting a profile activates it and inserts its instruction

When the user selects a profile that applies to the current platform, the bar SHALL set it as the
global active profile and SHALL insert its composed text — the instruction text plus a response-
style directive when the profile defines a response style — into the host composer through the
append-only insertion path, without auto-submitting. Insertion SHALL use the PREPEND mode (no
system-prompt mode is used in this slice).

#### Scenario: Selecting an applicable profile injects its instruction

- **WHEN** the user selects a profile whose `appliesTo` includes the current platform
- **THEN** that profile becomes the active profile
- **AND** its instruction text (with the response-style directive when set) is inserted into the
  composer, appended and not auto-submitted

#### Scenario: Profiles not applicable to the current platform are disabled

- **WHEN** the Profile menu is shown on a platform a profile does not apply to
- **THEN** that profile is shown disabled and cannot be activated or injected on this platform

#### Scenario: A profile with no response style inserts only the instruction

- **WHEN** the user selects an applicable profile that defines no response style
- **THEN** only its instruction text is inserted

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

