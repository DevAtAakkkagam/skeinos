## MODIFIED Requirements

### Requirement: Search overlay is keyboard-operable and token-styled

The system SHALL provide a search overlay mounted in the shadow-DOM UI harness that issues queries through
the `search.run` request and renders highlighted, paged results, filter controls (platform, date, folder,
archived, and an inert tag control), and an empty state. The overlay SHALL ALSO query the prompt library
(via `prompt.search`) over the same query text and render results as **two labelled groups —
conversations and prompts — within one keyboard-navigable listbox**, with focus moving across the group
boundary. Each conversation result row SHALL show its conversation's platform logo drawn from the
platform-branding registry and SHALL be openable to its conversation; each prompt result row SHALL show
its highlighted snippet and SHALL, when selected, **navigate to that prompt in the Prompts tab** (via a
navigation callback) rather than opening a host tab. The overlay SHALL show its empty state only when
**both** sources return nothing for a non-empty query. The overlay SHALL style only from `--sk-*` tokens,
use no host classes or hard-coded user-facing strings, and be fully keyboard-operable and ARIA-labelled.
It SHALL be a pure view over worker state, re-querying both sources on the `state.changed` broadcast.

#### Scenario: Keyboard-only search returns highlighted results

- **WHEN** a user opens the overlay, types a query, and navigates results using only the keyboard
- **THEN** matching results render with the query terms highlighted
- **AND** the focused result can be opened and the overlay dismissed without a pointer

#### Scenario: Prompts appear as their own group

- **WHEN** a query matches both conversations and prompts
- **THEN** the overlay shows a conversations group and a prompts group, each labelled, in one listbox

#### Scenario: Keyboard navigation crosses the group boundary

- **WHEN** the focus is on the last conversation result and the user presses the next-result key
- **THEN** focus moves to the first prompt result (and selection works on either group)

#### Scenario: Selecting a prompt navigates to the Prompts tab

- **WHEN** the user opens a prompt result
- **THEN** the overlay dismisses and the prompt opens in the Prompts tab (no host tab is opened)

#### Scenario: Empty state only when both sources are empty

- **WHEN** a query matches neither conversations nor prompts
- **THEN** the overlay shows its empty state rather than an empty list with no explanation

#### Scenario: A group with no matches shows no header

- **WHEN** a query matches conversations but no prompts
- **THEN** only the conversations group is shown (no empty prompts header)
