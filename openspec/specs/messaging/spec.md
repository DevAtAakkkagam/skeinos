# messaging Specification

## Purpose

The messaging capability defines the typed request/response and broadcast hub between content scripts/UI and the single-writer service worker: the `Request`/`Response<T>` contracts dispatched by `kind`, synchronous handler registration that survives worker restarts, conversion of handler failures into a typed error envelope, and a broadcast channel that fans state changes out to every open subscribed tab.

## Requirements

### Requirement: Typed request/response round-trip

The system SHALL provide a typed request channel where a caller sends a `Request` and receives a `Response<T>` that is either `{ ok: true, data }` or `{ ok: false, error }`, dispatched to a handler by the request `kind`.

#### Scenario: Request is dispatched and a success response returned

- **WHEN** a caller sends a request whose `kind` has a registered handler
- **THEN** the handler runs
- **AND** the caller receives `{ ok: true, data }` carrying that handler's result

#### Scenario: Unknown request kind returns a typed error

- **WHEN** a caller sends a request whose `kind` has no registered handler
- **THEN** the caller receives `{ ok: false, error }` with a typed error
- **AND** no exception propagates to the caller

### Requirement: Handler failures return an error envelope

A handler that throws SHALL be converted into an `{ ok: false, error }` response rather than rejecting the caller.

#### Scenario: Throwing handler is mapped to an error response

- **WHEN** a registered handler throws while processing a request
- **THEN** the caller receives `{ ok: false, error }` describing the failure

### Requirement: Synchronous handler registration

The messaging hub SHALL register its message listener synchronously at module load so that it is present on every service-worker activation, and feature modules SHALL register their handlers through the hub's registry.

#### Scenario: Listener is present after a cold worker start

- **WHEN** the service-worker module is evaluated, as on a cold start
- **THEN** the message listener is registered before any asynchronous initialization runs

### Requirement: Broadcast to all open tabs

The service worker SHALL provide a broadcast channel that delivers `Broadcast` messages (`state.changed`, `sync.status`, `platform.degraded`) to every open subscribed tab.

#### Scenario: A broadcast reaches multiple subscribed tabs

- **WHEN** two tabs are subscribed and the service worker broadcasts a `state.changed` message
- **THEN** both tabs' subscribers receive the same broadcast

#### Scenario: A subscriber can unsubscribe

- **WHEN** a subscriber disposes its subscription
- **AND** a subsequent broadcast is sent
- **THEN** that subscriber no longer receives broadcasts
