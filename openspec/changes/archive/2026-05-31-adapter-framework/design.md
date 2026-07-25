## Context

The extension is bootstrapped (shell + UI) with the `messaging`, `workspace-store`
foundations applied. Per the spine, content scripts must read and write each LLM
host page through **one generic adapter + a per-platform JSON config** so that a
broken platform isolates to its own overlay and selectors are hot-fixable without
a store release (CLAUDE.md [ADAPT];). The `messaging` capability already
defines `PlatformId` and the `platform.degraded` broadcast, so this change
*consumes* the bus rather than extending it.

This is the M1 critical-path change. It is the first code that
touches a real host DOM, so the framework must be proven against a recorded
fixture of a real platform (Claude) in the same slice — an untested framework
with no real config can't demonstrate detect/read/insert/submit.

## Goals / Non-Goals

**Goals:**
- A `PlatformAdapter` interface that is the *only* platform-facing
  contract the rest of the system imports.
- An `AdapterConfig` schema + runtime validator.
- A config loader that prefers the newest valid config (remote vs bundled) and
  **always** falls back to a bundled config on validation/fetch failure.
- One generic, config-driven adapter implementation (no per-platform branches).
- `selfCheck()` breakage isolation: missing required anchors disable only that
  platform's overlay.
- A reusable contract test harness (shared Vitest suite + documented fixture
  format) that every platform config must pass.
- A Claude config + recorded fixtures green against the suite; a broken fixture
  proving `selfCheck` fails cleanly.

**Non-Goals:**
- The scheduled canary runner and in-product breakage banner UI — C5
  `adapter-resilience` (T1.5).
- Full host docking/reflow coexistence — lands with the P0 platforms
  in M4 (T4.5). `mountPoints()` returns anchors here; the panel layout/reflow is
  later.
- Conversation indexing/normalization into the store — C8 `search` (T2.4); this
  change only exposes `readMessages`.
- The sidebar and input-bar UIs and prompt insertion UX — M2/M3.
- Any platform beyond Claude — later config+fixture PRs against this suite.

## Decisions

### D-A1: One generic adapter, zero per-platform code
A single `createAdapter(config)` returns a `PlatformAdapter` whose every method
is driven by `config.selectors` and `config.behaviors`. *Alternative:* a base
class subclassed per platform. *Rejected* — subclasses invite per-platform logic,
which defeats hot-fixability and makes a new platform a code change rather than a
config + fixture PR. The generic adapter keeps "a new platform = data" true and
keeps `PlatformAdapter` the sole external contract ([ADAPT]).

### D-A2: Config validation via an explicit hand-written validator (no new dep)
`validateAdapterConfig(raw): AdapterConfig | ValidationError[]` checks shape,
`platformId` membership, semver `configVersion`, presence of every required
selector key, and `behaviors` enum membership. *Alternative:* add `zod`/`ajv`.
*Rejected for now* — the schema is small and fixed, remote config is
the only untrusted input, and avoiding a runtime dependency keeps the MV3 bundle
lean. A schema lib can be revisited if the config grows. The validator is the
trust boundary for remote config ([MV3]: data ok, code never).

### D-A3: Loader prefers newest *valid* config, always falls back to bundled
`loadConfig(platformId)` returns the bundled config synchronously available, then
attempts a remote fetch; it adopts the remote config only if it validates **and**
its semver `configVersion` is greater than bundled. Any fetch error, parse error,
or validation failure → keep bundled. *Rationale:* offline-first and
hot-fixability without ever shipping a broken/unsafe selector set. Remote config
is cached via the store/settings layer so a later cold worker start doesn't refetch
synchronously (durable state, [SW]).

### D-A4: `selfCheck` runs against the live document and gates mounting
On adapter init, `selfCheck()` resolves the *required* anchors (`composer`,
`conversationList`, the mount anchors) and returns `{ ok, missing }`. The content
entry mounts the overlay only when `ok`; otherwise it emits `platform.degraded`
(existing broadcast) and stays dormant — isolating the failure to that tab/platform.
*Alternative:* throw on missing anchors. *Rejected* — a throw could break the host
page or other extension logic; the spine requires graceful, isolated degradation.

### D-A5: Contract harness = pure DOM fixture in jsdom, no live network
The shared suite loads a recorded HTML fixture into a jsdom document, builds the
adapter from that platform's config, and asserts the cross-platform invariants:
`selfCheck().ok`, `detectConversation()` resolves the seeded conversation,
`listConversations()` count matches the fixture, `readMessages()` returns ordered
role-tagged messages, `getInputElement()`/`insertText()`/`submit()` operate on the
composer, and `observe()` returns a working disposer. The **fixture format** is
documented: a captured HTML snapshot plus an `expected.json` describing the
conversations/messages/anchors the suite asserts. *Rationale:* deterministic,
offline, and identical for every future platform ("adapter contract
suite against recorded DOM fixtures").

### D-A6: Behaviors model the platform write quirks, not the adapter
`insertMode: 'execCommand' | 'react-set' | 'paste'` and
`submitMode: 'click' | 'enter'` let the generic adapter handle
React-controlled composers (Claude) vs. plain editables without branching on
`platformId`. The adapter switches on the *behavior value*, which any config can
set — so this stays config-driven.

## Risks / Trade-offs

- **Recorded fixtures drift from the live host** → the canary runner (C5) catches
  live drift in production within 24h; this change's job is the *offline* contract
  gate. Document fixture capture steps so re-recording is cheap.
- **Hand-written validator misses a malformed remote config edge case** → the
  loader's bundled fallback is the backstop (a rejected remote config simply keeps
  bundled), and validator behavior is unit-tested against malformed inputs. Revisit
  a schema lib if config complexity grows (D-A2).
- **`react-set` insertion is brittle across React versions** → encapsulated behind
  the `insertMode` behavior so a fix is a config/behavior change, and it's asserted
  by the Claude contract test. Real-host verification is an E2E concern (later).
- **`claude.ai` host permission scope** → request the single host pattern only,
  justified in the proposal; no `<all_urls>`, no credential permissions ([MV3]).

## Migration Plan

Additive and greenfield — new `extension/src/adapters/` module and a single new
host permission in the manifest. No data migration, no changes to existing
capabilities. Rollback = revert the change; bundled-only config means there is no
external dependency to unwind.

## Open Questions

- Exact Claude selector set + `insertMode` will be finalized against the captured
  fixture during implementation (recorded, not guessed).
- Where the remote-config cache lives (settings vs. a small store record) — settle
  in `tasks.md`; both satisfy the durable-state rule, default to `chrome.storage.local`
  via settings to avoid coupling the adapter to `workspace-store`.
