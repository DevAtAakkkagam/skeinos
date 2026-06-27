## ADDED Requirements

### Requirement: Uncategorized section is always present

The sidebar SHALL render the Uncategorized (unfiled) section unconditionally in the Folders
tab body — including when it holds no conversations — with its disclosure caret, the
"Uncategorized" label, and a conversation count that reads `0` when empty. The section SHALL
start expanded so its contents (or empty state) are visible on first paint, and SHALL be
included in the "expand all" action. When the section holds no conversations, it SHALL render
a single empty-state message that does not assert the user's authentication state, so the copy
stays correct whether the user is signed out of every platform, signed in with no history yet,
or has every conversation already filed.

#### Scenario: Uncategorized renders with zero unfiled conversations

- **WHEN** a read succeeds and no conversation is unfiled
- **THEN** the Uncategorized section is still rendered with its caret and a count of `0`
- **AND** expanding it shows the empty-state message rather than an empty list

#### Scenario: Uncategorized starts expanded on first paint

- **WHEN** the Folders tab body first renders
- **THEN** the Uncategorized section is expanded
- **AND** its conversations (or, when empty, its empty-state message) are visible without a click

#### Scenario: Empty-state copy is auth-agnostic

- **WHEN** the Uncategorized section renders with no conversations
- **THEN** the empty-state message states that chats will appear once the user chats on a
  supported AI
- **AND** the message makes no claim about whether the user is currently signed in

#### Scenario: Unfiled conversations render when present

- **WHEN** at least one conversation is unfiled
- **THEN** the Uncategorized section lists those conversations with its count matching the rows

## MODIFIED Requirements

### Requirement: Folder view distinguishes loading, ready, and error

The folder view SHALL track a load status of `loading`, `ready`, or `error` and SHALL render
accordingly so that a failed or in-flight load is never presented as an empty workspace. When a
read has succeeded and returned no active folders, the folder body SHALL render a slim ghost
create-folder row (not a dedicated "No folders yet" card); folder creation also remains
reachable from the section-header create affordance. A loading indicator SHALL appear only if
the first read has not resolved within a short delay, so a warm read does not flash a spinner. A
read that fails (after the transport's transient-retry budget is exhausted) SHALL show a
"couldn't load" state with a retry action, not the empty state.

#### Scenario: Empty state renders only after a successful read

- **WHEN** the folder view has not yet completed a successful read
- **THEN** it does not render the ghost create-folder row

#### Scenario: Genuinely empty workspace shows the ghost create-folder row

- **WHEN** a read succeeds and returns no active folders
- **THEN** the view renders the slim ghost "+ New folder" row
- **AND** activating it opens the create-folder dialog
- **AND** no dedicated "No folders yet" card is rendered

#### Scenario: Warm read does not flash a loading indicator

- **WHEN** the first read resolves within the short delay threshold
- **THEN** no loading indicator is shown before the tree (or ghost row) renders

#### Scenario: Failed load shows a retry affordance

- **WHEN** the initial read fails after the transient-retry budget is exhausted
- **THEN** the view shows a "couldn't load" state with a retry action
- **AND** invoking retry re-reads worker state and renders the result on success
