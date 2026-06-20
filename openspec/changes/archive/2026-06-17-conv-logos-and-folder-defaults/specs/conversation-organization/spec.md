## REMOVED Requirements

### Requirement: Conversation pin, archive, and colour state

**Reason**: The per-conversation colour tag is removed from the UI; the conversation row now leads
with the platform brand logo (see `conversation-filing`). Pin and archive are retained under a
slimmed requirement.

**Migration**: Pin and archive behaviour is preserved by the new "Conversation pin and archive
state" requirement. The `ConversationIndex.color` field remains in the schema but is dormant (no
longer set or read by the UI), so no data migration is required; existing stored colours are simply
not surfaced.

## ADDED Requirements

### Requirement: Conversation pin and archive state

The system SHALL let a user set per-conversation organization state — pinned and archived — on a
conversation's local `ConversationIndex` record. These fields SHALL be optional and additive
(absent meaning unpinned, not archived). Both mutations SHALL flow through the single-writer service
worker via the `conversation.pin` and `conversation.archive` mutation ops, and SHALL broadcast the
changed `conversations` store so every open tab updates. These fields are local-only and SHALL never
be synced.

#### Scenario: Pinning a conversation

- **WHEN** the user pins a conversation
- **THEN** the worker sets the conversation's `pinned` to `true`, persists it through the store,
  and broadcasts the `conversations` store change
- **AND** unpinning the same conversation sets `pinned` to `false`

#### Scenario: Archiving a conversation retains it

- **WHEN** the user archives a conversation
- **THEN** the worker sets the conversation's `archived` to `true` and the conversation and its
  folder assignment are retained (not deleted)
- **AND** unarchiving sets `archived` to `false`

#### Scenario: Mutating a missing conversation is rejected

- **WHEN** a pin or archive op targets a conversation id that does not exist
- **THEN** the worker rejects the mutation with an error and writes nothing

## MODIFIED Requirements

### Requirement: Conversation row context menu

The conversation row SHALL expose a context menu, openable by right-click and by a
keyboard-reachable trigger control, that surfaces the conversation organization actions:
Move to…, Pin to top (toggling to Unpin when pinned), and Archive (toggling to Unarchive when
archived). The Move to… action SHALL reuse the existing move-to-folder assignment flow. The menu
SHALL be fully keyboard-operable and ARIA-labelled, style only from theme tokens, and use no
hard-coded user-facing strings. Set colour, Rename, and Delete are out of scope and SHALL NOT
appear.

#### Scenario: Opening the menu from a conversation row

- **WHEN** the user right-clicks a conversation row or activates its menu trigger via keyboard
- **THEN** a context menu opens listing Move to…, Pin to top, and Archive
- **AND** Set colour, Rename, and Delete are not present

#### Scenario: Pin label reflects current state

- **WHEN** the menu opens for a conversation that is already pinned
- **THEN** the pin action reads as Unpin, and selecting it unpins the conversation

#### Scenario: Move to… opens the folder picker

- **WHEN** the user selects Move to… from the menu
- **THEN** the existing move-to-folder picker opens for that conversation and assignment
  proceeds through the existing flow
