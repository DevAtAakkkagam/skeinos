## Why

Nothing user-facing can ship until the extension can read and write a real LLM
page, and the spine rule is that it must do so through **one generic adapter +
per-platform JSON config** so a broken platform disables only its own overlay and
selectors are hot-fixable without a store release (CLAUDE.md [ADAPT]; LLD §4).
The framework is only provably correct against a real config, so M1 delivers it
*and* proves it on Claude in the same slice (LLD T1.1–T1.4). It unblocks the
entire downstream line: folders, search indexing, the input bar, and every other
P0 platform (each later platform is then just config + fixtures).

## What Changes

- Add `adapters/`: the `PlatformAdapter` contract (LLD §4.1) as the **only**
  platform-facing type the rest of the system sees, plus the `AdapterConfig`
  schema (LLD §4.2) with a runtime validator.
- **Config loader** (LLD §4.3): prefers the newest valid config (remote vs
  bundled), validates against the schema, and **falls back to bundled on any
  validation error or fetch failure** — bundled config is always present so the
  extension works offline. Remote config is *data only* (schema-validated); no
  remote code ([MV3]).
- **Generic config-driven adapter**: a single implementation that fulfils
  `detectConversation` / `listConversations` / `readMessages` / `getInputElement` /
  `insertText` / `submit` / `mountPoints` / `observe` / `selfCheck` by reading the
  active config's selectors and behaviors — no per-platform code paths.
- **`selfCheck()`**: on load, verify required anchors resolve; on failure return
  `{ ok: false, missing }` and disable only that platform's overlay (the canary
  runner + breakage banner UI are deferred to `adapter-resilience`/C5).
- **Adapter contract test harness**: one shared Vitest suite that runs any
  config against a recorded DOM fixture, with a documented fixture format — the
  gate every present and future platform must pass.
- **Claude config + DOM fixtures + self-check**: the first real `AdapterConfig`,
  recorded Claude fixtures, the contract suite green on them, and a broken fixture
  proving `selfCheck` fails cleanly.

Out of scope (deferred): the scheduled canary runner and in-product breakage
notice UI (C5 `adapter-resilience`); full docking/reflow host-coexistence work
(LLD §4.4 / T4.5, lands with the P0 platforms in M4); message *insertion* UX and
the sidebar/input-bar UIs themselves (M2/M3).

## Capabilities

### New Capabilities
- `platform-adapter`: the generic, config-driven platform contract — the
  `PlatformAdapter` interface, the `AdapterConfig` schema + validator, the
  bundled/remote loader with bundled fallback, `selfCheck`-based breakage
  isolation, and the shared contract test harness + fixture format.
- `adapter-claude`: the first concrete platform — the Claude `AdapterConfig`,
  its recorded DOM fixtures, and the contract suite + self-check passing against
  them (and failing cleanly on a broken fixture).

### Modified Capabilities
<!-- None. `messaging` already defines `platform.degraded` + `PlatformId`; this change consumes them without changing their requirements. -->

## Impact

- **New module** `extension/src/adapters/` — `runtime/` (loader, generic adapter,
  self-check, contract harness), the `PlatformAdapter`/`AdapterConfig` types, and
  `configs/claude.*` with bundled JSON. Nothing in `core/` imports it (deps point
  inward; LLD §2).
- **Consumes existing `messaging`**: emits `platform.degraded` (already in the
  `Broadcast` union) when `selfCheck` fails; reads conversation data to feed later
  indexing. No messaging requirement changes.
- **Manifest** ([MV3]): adds a host permission for `claude.ai` **only**, justified
  here — the first platform whose adapter ships. No `<all_urls>`, no credential
  permissions.
- **No new runtime dependencies**: schema validation uses a lightweight validator
  consistent with the existing stack; tests use Vitest + recorded DOM fixtures
  (jsdom) per the planned test stack (LLD §12).
- **Downstream**: unblocks C5 `adapter-resilience`, C6 `folders`, C8 `search`
  (indexing pipeline), C13 `input-bar`, and every future platform config
  (Gemini/Perplexity/Grok/DeepSeek/ChatGPT/Mistral), which become config + fixture
  PRs against the shared contract suite.
