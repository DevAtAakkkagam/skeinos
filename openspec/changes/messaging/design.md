## Context

The service worker is the single writer (spine rule 1) and holds no memory-only state (rule 2): it may be torn down between messages, so handlers must assume a cold start and be registered synchronously at module top level (guardrail SW-3). Message shapes are fixed by LLD §7. This change defines the transport + contracts only; the concrete `workspace.mutate` / `search.run` / `prompt.insert` handlers are implemented by their owning feature changes, which register into the hub's registry.

## Goals / Non-Goals

**Goals:**
- Typed `send`/dispatch over `chrome.runtime` using the LLD §7 `Request`/`Response` unions.
- A typed `AppError` envelope so no thrown error crosses the boundary.
- A broadcast channel delivering `Broadcast` messages to all open subscribed tabs.
- Synchronous, top-level handler registration that survives worker restart.
- A handler-registry seam so feature changes register `kind` handlers without editing the hub.

**Non-Goals:**
- Any concrete handler business logic (workspace mutate, search, prompt insert, sync) — owned by later changes; at most no-op/echo handlers exist here for tests.
- Storage access (sibling `workspace-store` change).
- Request correlation for streaming/multi-part responses — multi-model streaming is M5; here a request maps to a single response.

## Decisions

### D-1: `chrome.runtime` messaging with a discriminated-union contract
`sendMessage`/`onMessage` carrying `kind`-tagged unions, typed at the boundary.
- *Alternatives:* long-lived `Port` connections (only needed for streaming, deferred to M5); a hand-rolled event bus (reinvents runtime messaging). Rejected for now.

### D-2: Errors are values, not exceptions
Handlers return `Response<T>`; the hub catches throws and maps them to `{ ok: false, error }` with a typed `AppError`.
- *Rationale:* serialization-safe across the messaging boundary and forces callers to handle failure explicitly.

### D-3: Synchronous top-level registration + a handler registry
The hub registers its single `onMessage` listener at import time; feature modules call `registerHandler(kind, fn)` at *their* import time. This guarantees listeners exist on every worker wake (SW-3).
- *Alternative:* register inside an async init — rejected (the listener is lost when the worker restarts and re-evaluates the module).

### D-4: Broadcast via tab enumeration
The worker broadcasts by sending to the extension's open tabs; content scripts subscribe via `onMessage` filtered to `Broadcast` kinds.
- *Rationale:* keeps every open LLM tab live (spine). Durable truth still lives in storage, so a missed live update self-heals on the next query.

## Risks / Trade-offs

- **[Worker asleep when a broadcast is needed]** → broadcasts originate from worker events that wake it; a genuinely missed update is recovered by the next `workspace.query`.
- **[Non-serializable payload]** → contracts use plain JSON-able shapes; types guard against functions/handles in messages.
- **[Missing/late handler registration]** → an unknown `kind` returns a typed error; the registry is asserted in tests.
- **[Async response dropped]** → use the `return true` / Promise response pattern correctly so the message channel stays open until the handler resolves.

## Migration Plan

Greenfield: no existing messaging to migrate. Rollback is removal of the module; nothing persists.

## Open Questions

- Whether broadcasts target only host-matched tabs or all extension contexts (including the options page) — default to both UI surfaces.
- Streaming responses (multi-model, M5) will likely need a `Port`; out of scope now, but the contract leaves room to add it without breaking the request/response shape.
