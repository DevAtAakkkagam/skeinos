## ADDED Requirements

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

The bar SHALL provide a slash (`/`) trigger that opens a popover with its own search field. The
popover SHALL query the prompt library and list matches, each row showing the prompt title, a
highlighted snippet, and its `/slug` alias. Closing the popover SHALL return focus appropriately and
SHALL NOT insert anything.

#### Scenario: Opening the popover and searching

- **WHEN** the user activates the `/` trigger and types a query
- **THEN** the popover lists prompts matching the query
- **AND** each row shows the prompt's title, a snippet, and its `/slug` alias

#### Scenario: No matches

- **WHEN** the query matches no prompts
- **THEN** the popover shows an explicit empty state and inserts nothing

#### Scenario: Dismissing the popover inserts nothing

- **WHEN** the user dismisses the popover without selecting a prompt
- **THEN** the popover closes and the composer is unchanged

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

The bar SHALL reserve layout for the not-yet-built profile and model-selection controls by
rendering them as visibly disabled stubs, so the bar's layout does not reflow when those features
are added later.

#### Scenario: Profile and model controls appear disabled

- **WHEN** the input action bar is shown
- **THEN** the profile and model-selection controls are present but disabled
