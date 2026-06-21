## MODIFIED Requirements

### Requirement: Change observation with disposer

The adapter SHALL provide `observe(onChange)` that emits `AdapterEvent`s
(`conversation-changed`, `list-changed`, `composer-ready`) and returns a disposer that stops all
observation when called. It SHALL emit `composer-ready` when the composer first becomes available
and SHALL re-emit `composer-ready` whenever the composer element is replaced by a new element
(e.g. on single-page-app navigation), so an overlay anchored to the composer can re-attach.

#### Scenario: Observer receives events and can be disposed

- **WHEN** a caller registers via `observe(onChange)` and the active conversation changes
- **THEN** `onChange` receives a `conversation-changed` event
- **AND** after the returned disposer is called, no further events are delivered

#### Scenario: composer-ready re-emits when the composer element is replaced

- **WHEN** the host replaces the composer element with a new element while an observer is registered
- **THEN** `onChange` receives a further `composer-ready` event for the new composer
