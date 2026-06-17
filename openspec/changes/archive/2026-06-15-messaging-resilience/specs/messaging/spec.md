## ADDED Requirements

### Requirement: Transparent retry of transient transport failures

The messaging client SHALL support sending a request with transparent retry of
*transient transport* failures — errors that indicate the service worker was dormant or
still waking rather than a real failure (`no_response`, `send_failed`). A retried send
SHALL make a bounded number of attempts with a delay between them, and SHALL resolve with
the first successful `Response` or, if every attempt fails, the last error envelope.

Retry SHALL be **opt-in per call**: a caller performing an idempotent read enables it,
while a caller performing a non-idempotent operation does not, so the client never
silently replays a mutation whose response was lost. Logic and domain errors (e.g.
`unknown_kind`, `handler_error`, validation errors) SHALL NOT be retried, since they
indicate a real failure rather than a waking worker. When a retried send exhausts its
attempt budget, the client SHALL record the final error `code` so the failure mode is
observable.

#### Scenario: A transient transport error is retried until it succeeds

- **WHEN** a caller sends a retryable request and the first attempt(s) resolve with a transient transport error (`no_response` or `send_failed`)
- **AND** a later attempt resolves with `{ ok: true, data }`
- **THEN** the caller receives that success response
- **AND** the intermediate transient failures are not surfaced to the caller

#### Scenario: A non-retryable send is attempted once

- **WHEN** a caller sends a request without opting into retry
- **AND** the attempt resolves with a transient transport error
- **THEN** the caller receives that error envelope without any further attempt

#### Scenario: A logic error is never retried

- **WHEN** a caller sends a retryable request
- **AND** an attempt resolves with a logic or domain error (e.g. `unknown_kind`, `handler_error`)
- **THEN** the caller receives that error envelope immediately without retrying

#### Scenario: Exhausting the retry budget returns the last error and records it

- **WHEN** a caller sends a retryable request and every attempt within the budget resolves with a transient transport error
- **THEN** the caller receives the last error envelope
- **AND** the final error `code` is recorded for diagnosis

## MODIFIED Requirements

### Requirement: Broadcast to all open tabs

The service worker SHALL provide a broadcast channel that delivers `Broadcast` messages
(`state.changed`, `sync.status`, `platform.degraded`) to every open subscriber, including
host tabs (via tab messaging) and extension pages such as the side panel (via runtime
messaging). Broadcast delivery SHALL be **best-effort, not guaranteed**: a subscriber may
miss a broadcast when the worker is torn down before fan-out completes or when no page is
listening, and a failed per-subscriber delivery SHALL be swallowed rather than propagated.
Because durable truth lives in the store, consumers SHALL be able to reconcile current
state by re-querying the worker, so a missed broadcast self-heals on the next read.

#### Scenario: A broadcast reaches multiple subscribed tabs

- **WHEN** two tabs are subscribed and the service worker broadcasts a `state.changed` message
- **THEN** both tabs' subscribers receive the same broadcast

#### Scenario: A broadcast reaches an extension-page subscriber

- **WHEN** an extension page (e.g. the side panel) is subscribed and no host tab is open
- **THEN** the page's subscriber still receives the broadcast via runtime messaging

#### Scenario: A subscriber can unsubscribe

- **WHEN** a subscriber disposes its subscription
- **AND** a subsequent broadcast is sent
- **THEN** that subscriber no longer receives broadcasts

#### Scenario: A missed broadcast is recoverable by re-query

- **WHEN** a state change is broadcast but a subscriber misses it (worker torn down before fan-out, or no page listening)
- **THEN** the broadcast failure is swallowed without error
- **AND** the subscriber observes the change the next time it re-queries the worker
