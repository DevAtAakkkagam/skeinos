# tags Specification

## Purpose

The tags capability defines cross-cutting, syncable `Tag` records (label and optional color)
that can be assigned to many conversations and prompts, created and mutated only through the
single-writer service worker with tier-gated creation. It defines the ephemeral tag-filter that
narrows the unified library (AND semantics) without persisting or mutating records, and a
dedicated tags-management view with live usage counts and per-tag rename/recolor/delete.

## Requirements

### Requirement: Tag creation through the single writer

The service worker SHALL create a `Tag` record (`id`, `label`, optional `color`) in
response to a `workspace.mutate` op, writing through the `tags` Repo so the sync
envelope (`rev`/`updatedAt`/`deviceId`/`hash`) is stamped. Content scripts and UI SHALL
NOT write the `tags` store directly. After a successful create the worker SHALL
broadcast `state.changed` so every open tab re-queries.

#### Scenario: Creating a tag persists it and broadcasts

- **WHEN** the UI dispatches a tag-create op with a label
- **THEN** a `Tag` record with that label is written to the `tags` store with a stamped sync envelope
- **AND** the worker broadcasts `state.changed`

#### Scenario: Label is required and trimmed

- **WHEN** a tag-create op carries an empty or whitespace-only label
- **THEN** the create is rejected and no record is written

### Requirement: Tag creation is tier-gated

The tag-create handler SHALL call `assertWithinQuota('tags', <live tag count>, tier)`
before writing, where `tier` comes from settings and the limit comes from `TIER_LIMITS`
(FREE = 10). When the count is at the limit it SHALL reject with the `quota_exceeded`
code carrying `{ resource: 'tags', count, limit }`, and SHALL NOT write a record. The
create UI SHALL catch `quota_exceeded` and render an upgrade nudge for `tags` without
discarding the user's typed label.

#### Scenario: Create blocked at the free limit

- **WHEN** a FREE-tier user already has 10 tags and attempts to create another
- **THEN** the worker rejects with `quota_exceeded` and detail `{ resource: 'tags', count: 10, limit: 10 }`
- **AND** no new `Tag` record is written

#### Scenario: Nudge shown without losing input

- **WHEN** the create UI receives `quota_exceeded`
- **THEN** it renders the upgrade nudge for `tags`
- **AND** the typed label remains available to the user

#### Scenario: PRO tier is unlimited

- **WHEN** a PRO-tier user creates a tag with any existing tag count
- **THEN** the create succeeds (no quota rejection)

### Requirement: Tag rename and recolor

The worker SHALL rename a tag's `label` and SHALL set or clear a tag's `color` in
response to `workspace.mutate` ops, each writing through the Repo (stamping the
envelope) and broadcasting `state.changed`. The change SHALL propagate everywhere the
tag is rendered (filter chips, carrier rows, the tags view) on the next query.

#### Scenario: Renaming propagates

- **WHEN** a tag is renamed
- **THEN** the `Tag` record's label is updated with a bumped `rev`
- **AND** every surface re-querying after the broadcast shows the new label

#### Scenario: Recolor sets or clears the color

- **WHEN** a recolor op supplies a color, then a later op omits it
- **THEN** the record's `color` is set, then cleared

### Requirement: Tag deletion cleans up carriers

The worker SHALL delete a `Tag` record (writing a tombstone via the Repo) AND remove
that tag id from the `tags` array of every conversation and prompt that carries it, in
the same single-writer flow, then broadcast `state.changed`. No carrier SHALL retain a
reference to a deleted tag.

#### Scenario: Deleting a tag detaches it from all carriers

- **WHEN** a tag carried by two conversations and one prompt is deleted
- **THEN** a tombstone is written for the tag
- **AND** none of those three records still contains the tag id in its `tags` array

### Requirement: Multi-tag assignment to conversations and prompts

The worker SHALL assign or unassign a tag on a conversation and on a prompt in response
to `workspace.mutate` ops, supporting many tags per record (the `tags` array). Assigning
an already-present tag is idempotent; unassigning an absent tag is a no-op. Assignment
SHALL reference only existing tag ids. Each successful assignment SHALL broadcast
`state.changed`.

#### Scenario: A conversation carries multiple tags

- **WHEN** two different tags are assigned to one conversation
- **THEN** the conversation's `tags` array contains both ids

#### Scenario: Assignment is idempotent

- **WHEN** a tag already on a record is assigned again
- **THEN** the record's `tags` array is unchanged (no duplicate)

#### Scenario: Unassign removes the tag

- **WHEN** a tag on a record is unassigned
- **THEN** the record's `tags` array no longer contains that id

### Requirement: Tag-filter narrows the unified library as ephemeral view state

The library view SHALL support filtering the unified conversation list by a set of
selected tags, rendering only conversations whose `tags` array contains **all** selected
tags (AND semantics). The selected-tag set SHALL be **ephemeral view state** — not
persisted and not synced — and selecting or clearing tags SHALL NOT mutate any record.
It SHALL compose with the platform view-filter (both narrow the same rendered list).

#### Scenario: Selecting a tag narrows the list

- **WHEN** a tag is selected in the filter
- **THEN** only conversations carrying that tag are rendered

#### Scenario: Multiple selected tags intersect

- **WHEN** two tags are selected
- **THEN** only conversations carrying both tags are rendered

#### Scenario: Filter state is not persisted

- **WHEN** the panel is reloaded after selecting tags
- **THEN** the tag filter resets to none selected and no record was modified

### Requirement: Dedicated tags view with live counts

The UI SHALL provide a tags management view listing every tag with its live usage count
(the number of conversations carrying it), and offering rename, recolor, and delete for
each. Counts SHALL be derived client-side from the unified conversation list, so a tag's
displayed count equals the number of rows its filter would render.

#### Scenario: Counts reflect assignments

- **WHEN** a tag is assigned to three conversations
- **THEN** the tags view shows a count of 3 for that tag

#### Scenario: Management actions are offered per tag

- **WHEN** the tags view renders a tag row
- **THEN** rename, recolor, and delete actions are available for it
