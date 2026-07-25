## 1. Contract & schema types (T1.1)

- [x] 1.1 Create `extension/src/adapters/types.ts`: `PlatformAdapter`,
  `ConversationRef`, `Message`, `SelfCheckResult`, `AdapterEvent`, `AdapterConfig`
  (selectors + behaviors), reusing `PlatformId` from `shared/`
- [x] 1.2 Export the public surface via `extension/src/adapters/index.ts` so
  nothing outside `adapters/` imports internals (only `PlatformAdapter` et al.)
- [x] 1.3 Implement `validateAdapterConfig(raw): AdapterConfig | ValidationError[]`
  in `adapters/runtime/validate.ts` (platformId membership, semver, required
  selector keys, behavior enums) — no new runtime dependency (D-A2)
- [x] 1.4 Unit-test the validator: valid config passes; missing selector, unknown
  `platformId`, non-semver version, and bad behavior enum each fail with errors

## 2. Config loader (T1.1)

- [x] 2.1 Implement `loadConfig(platformId)` in `adapters/runtime/loader.ts`:
  bundled config available synchronously; remote adopted only if it validates and
  `configVersion` > bundled; any fetch/parse/validation failure falls back to
  bundled (D-A3)
- [x] 2.2 Cache the resolved remote config in durable storage (settings /
  `chrome.storage.local`) so a cold worker start does not refetch synchronously ([SW])
- [x] 2.3 Unit-test loader paths: newer-valid adopted; invalid/failed-fetch →
  bundled; older-or-equal → bundled

## 3. Generic config-driven adapter (T1.2)

- [x] 3.1 Implement `createAdapter(config): PlatformAdapter` in
  `adapters/runtime/adapter.ts` — single implementation, no per-platform branches
  (D-A1)
- [x] 3.2 `selfCheck()`: resolve required anchors, return `{ ok, missing }` (D-A4)
- [x] 3.3 Read ops: `detectConversation`, `listConversations`, `readMessages`
  (ordered, role-tagged) from selectors
- [x] 3.4 Write ops: `getInputElement`, `insertText` (switch on `insertMode`:
  execCommand / react-set / paste), `submit` (switch on `submitMode`: click /
  enter) (D-A6)
- [x] 3.5 `mountPoints()` returns sidebar/inputBar anchors; `observe(onChange)`
  wires a MutationObserver emitting `AdapterEvent`s and returns a working disposer
- [x] 3.6 Content-entry wiring: run `selfCheck()` on init; on failure skip mount
  and emit `platform.degraded` via the messaging client (consumes existing broadcast)

## 4. Shared contract test harness (T1.3)

- [x] 4.1 Implement a reusable `runAdapterContract(config, fixture)` Vitest helper
  in `extension/tests/adapter-contract.ts` loading the fixture HTML into jsdom and
  asserting all `PlatformAdapter` invariants (D-A5)
- [x] 4.2 Define and document the fixture format (captured HTML + `expected.json`
  describing conversations/messages/anchors) in
  `extension/tests/fixtures/README.md`
- [x] 4.3 Add a synthetic reference fixture and prove the harness goes green
  against it (suite-level self-test)

## 5. Claude config + fixtures + self-check (T1.4)

- [x] 5.1 Record Claude DOM fixtures (conversation list + an open conversation)
  and author `expected.json`
- [x] 5.2 Author the bundled Claude `AdapterConfig` (`adapters/configs/claude.json`
  + loader registration); finalize selectors and `insertMode` against the fixture
- [x] 5.3 Run the shared contract suite with the Claude config + fixture — green
- [x] 5.4 Add a broken Claude fixture (composer anchor removed) and assert
  `selfCheck()` returns `{ ok: false, missing }` without throwing
- [x] 5.5 Add the `claude.ai` host permission to the manifest (WXT config) with a
  justification comment — host-scoped only, no `<all_urls>`, no credentials ([MV3])

## 6. Verification

- [x] 6.1 `pnpm test` / `pnpm typecheck` / `pnpm lint` green; CI passes
- [x] 6.2 Confirm `core/` imports nothing from `adapters/` (dependency direction)
- [x] 6.3 Update `tasks.md` checkboxes and mark the change ready to archive
