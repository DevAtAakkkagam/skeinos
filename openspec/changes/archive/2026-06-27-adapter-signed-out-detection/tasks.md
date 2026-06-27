## 1. Config schema & values

- [x] 1.1 Add optional `authedMarker?: string` to the `AdapterConfig` type and the schema validator; reject an empty-string `authedMarker`; absence means "never classified signed-out".
- [x] 1.2 Set `authedMarker` in each config: chatgpt `[data-testid="accounts-profile-button"]`, claude `[data-testid="user-menu-button"]`, gemini `.mavatar-container`, perplexity `[*|href="#pplx-icon-user-filled"]`. Bump each `configVersion`.
- [x] 1.3 Replace the aria-label selectors: chatgpt `sidebarAnchor` → `nav:has(#history)`. For claude/perplexity `conversationList`+`sidebarAnchor`, use the stable nav-container `id`/`data-testid` once provided; until then ship the `nav:has(a[href^="/chat/"])` / `nav:has(a[href^="/search/"])` fallback.
- [x] 1.4 Update the schema validation tests for the new optional field and the bumped versions.

## 2. Capability tiers & selfCheck classification

- [x] 2.1 In `adapters/types.ts`, derive `COMPOSE`/`WORKSPACE` tiers from the existing anchor keys (keep `REQUIRED_ANCHORS` as their union for the happy path).
- [x] 2.2 Add an adapter helper to resolve `authedMarker` against the document (no-op false when the selector is absent), exposed for the classifier and `waitForSelfCheck`.
- [x] 2.3 Decouple `selfCheck()` from the reaction: it returns `{ ok, missing }` only and no longer unconditionally signals `platform.degraded`.

## 3. Content-script classification & activation

- [x] 3.1 On a failing check, classify: `authedMarker` present → breakage; else COMPOSE present → compose-only; else → dormant.
- [x] 3.2 Breakage branch: keep current behavior (mount banner via `mountBanner` with `onRecover: activate`, report degraded, fire `adapter_fallback_shown`).
- [x] 3.3 Compose-only branch: run the input-bar mount path (and `composer-ready` re-anchor) without history ingest, active-conversation reporting, or the banner.
- [x] 3.4 Dormant branch: stay quiet — no overlay, no banner, no degraded report.
- [x] 3.5 Ensure a later sign-in recovers cleanly (composer/anchors appear) without a reload, reusing the existing observe/remount path.

## 4. Early-exit in waitForSelfCheck

- [x] 4.1 Evaluate `authedMarker` on each probe; resolve to the signed-out path once anchors keep failing, `authedMarker` is absent, and either the COMPOSE tier resolved or a short settle window elapsed.
- [x] 4.2 Preserve never-reject semantics and the final-anchor-result return for the breakage path; keep the full timeout for ambiguous mid-hydration pages.

## 5. Telemetry & health hygiene

- [x] 5.1 Skip `reportHealth`-driven degraded/`hotfixWanted` for signed-out classifications; keep it for breakage.
- [x] 5.2 Suppress `adapter_fallback_shown(selfcheck_failed)` when signed-out; optionally emit a distinct id-less, consent-gated `adapter_signed_out` diagnostic.

## 6. No-text-selector guard

- [x] 6.1 Add a guard test over every shipped config that fails on any `[aria-label="…"]`, `:contains()`/text, or assumed auth/route URL selector; allowlist conversation `href`-prefix selectors.
- [x] 6.2 Confirm all four post-change configs pass the guard. (Anchor/classification selectors linted; `sendButton` deferred to 8.2 pending stable testids.)

## 7. Tests & verification

- [x] 7.1 Banner tests: breakage page (authedMarker present) raises banner; signed-out compose-only and dormant pages raise none.
- [x] 7.2 Classification tests against the four real shapes (ChatGPT/Gemini compose-only, Claude dormant, Perplexity full-pass) using fixtures.
- [x] 7.3 Health/telemetry tests: signed-out failure does not mark degraded, set hotfix, or fire `selfcheck_failed`.
- [x] 7.4 Run `typecheck` + `test`, then `test:browser`. (typecheck + lint + 906 unit tests green; the one `test:browser` failure is in unrelated pre-existing profiles WIP.)

## 8. Pending input (user-supplied selectors)

- [x] 8.1 Fold in the stable Claude + Perplexity sidebar `<nav>` container selectors (`nav:has([data-testid="pin-sidebar-toggle"])` / `nav:has([data-testid="collapsed-sidebar-expand-area"])`), removing the `nav:has(a[href^=…])` fallback and the authed-but-empty-account edge. Configs bumped to 1.2.0; contract fixtures updated.
- [x] 8.2 Resolved as a no-op (documented): `sendButton` is not a runtime selector. The overlay is append-only and never auto-submits (design D-5), so `adapter.submit()` — the only `sendButton` consumer — is never called in the live product and is exercised solely by the contract suite. A localized `aria-label` send selector therefore cannot break a user, and the platforms expose no stable `data-testid` on their send buttons (Claude aria-label-only; Perplexity's only hook is a namespaced SVG sprite ref the happy-dom parser rejects). `sendButton` stays out of `LINTED_KEYS` by design; the `it.todo` is replaced with a comment recording the rationale. When multi-model comparison makes programmatic send a runtime path, the i18n-safe answer is `submitMode:"enter"` (no selector) — revisit then.
