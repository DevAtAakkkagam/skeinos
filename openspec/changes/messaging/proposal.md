## Why

Content scripts and the in-page UI must never write storage directly — they message the service worker, the single writer, which keeps every open LLM tab consistent and race-free (CLAUDE.md spine; TDD §1.2). The entire adapter line (M1) and every feature that mutates state depend on this typed bus existing first (M0 task T0.4).

## What Changes

- Add `core/messaging`: a typed request/response channel plus a broadcast (pub/sub) channel over `chrome.runtime` messaging (LLD §7).
- Define the `Request` discriminated union, `Response<T>` (`{ ok: true, data }` | `{ ok: false, error: AppError }`), and the `Broadcast` union (`state.changed`, `sync.status`, `platform.degraded`).
- **Service-worker side:** a handler registry registered synchronously at module top level (so it survives worker restarts), dispatch by `kind`, and a `broadcast()` that fans out to all open tabs.
- **Client side (content script / UI):** a typed `send(request)` returning `Response<T>`, and a `subscribe(handler)` for broadcasts.
- Unknown or malformed messages return a typed error rather than throwing.

## Capabilities

### New Capabilities
- `messaging`: the typed request/response + broadcast hub between content scripts/UI and the single-writer service worker — message contracts, synchronous handler registration, dispatch, the error envelope, and multi-tab broadcast.

### Modified Capabilities
<!-- None — greenfield messaging layer. -->

## Impact

- **New module** `extension/src/core/messaging/` (shared by the background and content entrypoints) + `shared/` message and `AppError` types.
- **No new dependencies**; uses `chrome.runtime`/`chrome.tabs`.
- **Single-writer protocol**: this establishes the channel all mutations flow through. Concrete handler logic (`workspace.mutate`, `search.run`, etc.) is *not* added here — feature changes register their handlers into this hub.
- **Tested** with Vitest (typed dispatch, error envelope, synchronous registration) plus an integration test asserting a broadcast reaches two subscribed tabs.
- **Downstream**: unblocks `adapter-framework` (M1) and every state-mutating feature. Independent of `workspace-store` and `settings`.
