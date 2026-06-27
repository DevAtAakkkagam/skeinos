## Why

The adapter resilience banner ("Skeinos is paused on this page — the `<platform>` layout changed") fires on logged-out host pages, where it is a misdiagnosis: the layout did not change, the user is simply not signed in. A failed `selfCheck()` is overloaded — it conflates *not-yet-hydrated*, *signed-out*, and *genuinely broken*, but the banner is only correct for the last. The false banner also pollutes the health/canary signal and triggers needless D-R4 remote selector refreshes for adapters that are working fine. Observed live on ChatGPT, Gemini, and Claude (Perplexity already passes signed-out by luck).

## What Changes

- Add an optional, language-independent `authedMarker` selector to `AdapterConfig` — an element present **only** when the user is signed in — and ship one per platform (ChatGPT, Claude, Gemini, Perplexity).
- Make a failed `selfCheck()` **classify** the failure before reacting, using `authedMarker` plus capability tiers (COMPOSE = `composer` + `inputBarAnchor`; WORKSPACE = `conversationList` + `sidebarAnchor`):
  - `authedMarker` present → genuine breakage → **show the banner** (its true, preserved purpose).
  - not signed in + COMPOSE present → **compose-only activation**: mount the input bar, skip history ingest/filing, no banner (ChatGPT/Gemini signed-out).
  - not signed in + COMPOSE absent → **dormant, quiet**, no banner (Claude `/login`).
- **Fail-quiet**: when we can neither prove signed-in nor prove breakage, stay silent rather than banner.
- Telemetry/health hygiene: when not signed in, do **not** fire `adapter_fallback_shown(selfcheck_failed)` and do **not** set `hotfixWanted`; optionally emit a distinct low-volume `adapter_signed_out` diagnostic.
- `waitForSelfCheck` early-exit: evaluate `authedMarker` on each probe so a confidently signed-out page resolves to the quiet path promptly instead of waiting the full 8s timeout.
- **i18n-safe selector rule (folded in):** adapter selectors must never depend on visible text, `aria-label` values, or assumed auth/route URLs (this already broke the extension once). Replace the three `nav[aria-label="…"]` selectors (ChatGPT/Claude/Perplexity) with stable structural equivalents, and add a guard test that fails CI if any config reintroduces a text/`aria-label`/auth-URL selector. (Conversation `href`-prefix selectors like `/c/`, `/chat/`, `/search/` are the conversation identity model and remain allowed.)

## Capabilities

### New Capabilities

_None — this modifies existing capabilities._

### Modified Capabilities

- `platform-adapter`: add `authedMarker` to the config schema; selfCheck-failure classification via capability tiers + `authedMarker`; compose-only activation path; `waitForSelfCheck` early-exit on `authedMarker`; the no-text/`aria-label`/auth-URL selector rule and its CI guard.
- `adapter-resilience`: the breakage banner is shown only when the platform is signed-in-but-broken; when not signed in, no banner, no `selfcheck_failed` fallback telemetry, and no `hotfixWanted`; optional `adapter_signed_out` diagnostic.

## Impact

- **Config + schema:** `adapters/configs/{chatgpt,claude,gemini,perplexity}.json` (add `authedMarker`, replace `aria-label` selectors); `AdapterConfig` type + schema validation.
- **Adapter/runtime:** `adapters/types.ts` (`REQUIRED_ANCHORS` → capability tiers), `adapters/runtime/adapter.ts` (selfCheck / tier + authed checks), `adapters/runtime/ready.ts` (`waitForSelfCheck` early-exit).
- **Content script:** `content/index.ts` (classification + compose-only activation branch).
- **Resilience/observability:** `adapters/resilience/report.ts` and the fallback-shown telemetry (suppress when not signed in; optional `adapter_signed_out`). `Banner.tsx` copy unchanged but no longer mounted for signed-out.
- **Tests:** `adapter-resilience-banner`, content gating/classification, new no-text-selector guard test.
- **Pending input:** stable `id`/`data-testid` for the Claude and Perplexity sidebar `<nav>` container (user supplying); until then those two ship the `nav:has(a[href^=…])` fallback with an accepted authed-but-empty-account edge.
