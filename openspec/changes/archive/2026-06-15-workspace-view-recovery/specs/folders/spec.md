## MODIFIED Requirements

### Requirement: Folder state is single-writer and multi-tab consistent

Folder reads and mutations SHALL flow through the service worker as the single writer via the
messaging hub, the worker SHALL persist all durable folder state in the store (surviving worker
restart), and after a mutation it SHALL broadcast a state change so every open subscribed tab
reflects the update. Because broadcast delivery is best-effort, the view that originates a
mutation SHALL NOT rely on the broadcast or the mutation response alone: after every mutation
attempt — whether it resolves successfully or with a transient transport failure — the view
SHALL reconcile by re-reading worker state (observe-don't-replay), since the worker may have
committed the write even when its acknowledgement was lost. The view SHALL NOT replay the
mutation to recover. If, after reconciling, the change is confirmed not to have taken effect,
the failure SHALL be surfaced to the user rather than silently swallowed.

#### Scenario: A folder change reaches other open tabs

- **WHEN** a folder is created, moved, renamed, pinned, archived, or deleted in one tab
- **THEN** the service worker persists the change and broadcasts a state change
- **AND** other subscribed tabs re-render the tree to reflect it

#### Scenario: Folder state survives a reload

- **WHEN** folders and conversation assignments are created and the overlay is reloaded
- **THEN** the rebuilt sidebar shows the same tree, ordering, pins, archives, and counts (D19)

#### Scenario: The UI never writes storage directly

- **WHEN** the sidebar applies any folder change
- **THEN** it does so by sending a mutation message to the worker
- **AND** it does not write IndexedDB from the content script or UI

#### Scenario: A committed mutation with a lost acknowledgement still appears

- **WHEN** the user creates (or otherwise mutates) a folder and the worker commits it but the mutation response and broadcast are missed (e.g. the worker is torn down at the message edge)
- **THEN** the originating view re-reads worker state after the attempt
- **AND** the committed change appears without a remount
- **AND** the mutation is not re-sent

#### Scenario: A mutation that did not take effect is surfaced, not lost

- **WHEN** a mutation attempt fails and a reconciling re-read confirms the change did not take effect
- **THEN** the user is shown that the action failed
- **AND** the user's input is not silently discarded

## ADDED Requirements

### Requirement: Folder view distinguishes loading, ready, and error

The folder view SHALL track a load status of `loading`, `ready`, or `error` and SHALL render
accordingly so that a failed or in-flight load is never presented as an empty workspace. The
"No folders yet" empty state SHALL render only after a read has succeeded and returned no
folders. A loading indicator SHALL appear only if the first read has not resolved within a
short delay, so a warm read does not flash a spinner. A read that fails (after the transport's
transient-retry budget is exhausted) SHALL show a "couldn't load" state with a retry action,
not the empty state.

#### Scenario: Empty state renders only after a successful read

- **WHEN** the folder view has not yet completed a successful read
- **THEN** it does not render the "No folders yet" empty state

#### Scenario: Genuinely empty workspace shows the empty state

- **WHEN** a read succeeds and returns no folders
- **THEN** the view renders the "No folders yet" empty state with the create-folder affordance

#### Scenario: Warm read does not flash a loading indicator

- **WHEN** the first read resolves within the short delay threshold
- **THEN** no loading indicator is shown before the tree (or empty state) renders

#### Scenario: Failed load shows a retry affordance

- **WHEN** the initial read fails after the transient-retry budget is exhausted
- **THEN** the view shows a "couldn't load" state with a retry action
- **AND** invoking retry re-reads worker state and renders the result on success
