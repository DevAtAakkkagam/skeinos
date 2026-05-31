## 1. Contracts

- [x] 1.1 Define `Request`, `Response<T>`, `Broadcast`, and `AppError` in `shared/` per LLD §7
- [x] 1.2 Define the handler-registry types (`registerHandler(kind, fn)`)

## 2. Service-worker hub

- [x] 2.1 Register a single `chrome.runtime.onMessage` listener synchronously at module top level; dispatch by `kind`
- [x] 2.2 Wrap handler invocation to return `{ ok:true, data }` or map throws / unknown-kind to `{ ok:false, error }`
- [x] 2.3 Implement `broadcast(msg)` fanning out to all open subscribed tabs
- [x] 2.4 Expose `registerHandler` so feature changes can add their `kind` handlers

## 3. Client (content script / UI)

- [x] 3.1 Implement typed `send(request): Promise<Response<T>>`
- [x] 3.2 Implement `subscribe(handler): dispose` for `Broadcast` messages

## 4. Tests

- [x] 4.1 Round-trip: a registered kind returns a typed success response (spec: messaging)
- [x] 4.2 Unknown kind and a throwing handler both return `{ ok:false, error }` with no throw escaping
- [x] 4.3 The listener is registered synchronously at module load (structural assertion)
- [x] 4.4 Integration: a broadcast reaches two subscribed tabs; unsubscribe stops delivery
