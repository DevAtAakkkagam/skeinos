## Context

The per-tab content script gates the overlay on `REQUIRED_ANCHORS = [composer, conversationList, sidebarAnchor, inputBarAnchor]`. `waitForSelfCheck` (`adapters/runtime/ready.ts`) re-probes on DOM mutations for up to 8s to absorb SPA hydration; if anchors are still missing it returns a failing result and `content/index.ts` raises the breakage banner, reports the platform degraded, fires `track('adapter_fallback_shown', { reason: 'selfcheck_failed' })`, and (via health) sets `hotfixWanted`.

A failed `selfCheck()` therefore drives one reaction regardless of *why* it failed. Observed live, signed-out pages each fail differently — there is **no single signed-out DOM signature**:

| Platform | URL on logout | `composer` | `conversationList`/`sidebar` | today |
|---|---|---|---|---|
| ChatGPT | unchanged | present | absent (`#history` gone) | false banner |
| Gemini | unchanged | present | absent | false banner |
| Claude | redirects `/login` | **absent** (auth form) | absent | false banner |
| Perplexity | unchanged | present | present (nav container) | works (passes) |

Constraints: [ADAPT] config-driven + per-platform isolation; [PRIV] no content leaves the device, telemetry off by default; [SW] no memory-only worker state; and the project rule that selectors must not depend on visible text, `aria-label`, or assumed auth/route URLs (a localized `aria-label` selector already broke the extension once).

## Goals / Non-Goals

**Goals:**
- Never show the breakage banner for a signed-out page.
- Preserve the banner for its real purpose: a signed-in page whose anchors genuinely broke.
- Keep signed-out tabs out of the degraded/canary/hotfix path and out of `selfcheck_failed` telemetry.
- Give signed-out ChatGPT/Gemini partial value (the input bar) instead of a scary notice.
- Remove text/`aria-label`/auth-URL selectors from configs and prevent their reintroduction.

**Non-Goals:**
- Detecting *which* tier (Free/Pro) the user is on — only signed-in vs not.
- Changing the banner's copy or visual design (it is simply not mounted when signed-out).
- Reworking sync, search, or the side panel.
- A positive signed-out marker per platform (we use an *authed* marker instead — see Decisions).

## Decisions

### D1 — Classify the failure with a per-platform `authedMarker`, not a signed-out marker

Add optional `authedMarker: string` to `AdapterConfig`: a selector matching an element present **only when signed in**. On a failed `selfCheck()`, branch on whether `authedMarker` resolves.

*Why an authed marker, not a signed-out marker:* the banner should fire only on **positive evidence** that the app shell is loaded (signed in) yet an anchor is missing. Absence of the authed marker = "not signed in OR not yet loaded" → both should stay quiet. This makes fail-quiet the natural default and needs only one selector per platform instead of enumerating every signed-out shell.

Locked values (language-independent; no text/`aria-label`/URL):
- ChatGPT — `[data-testid="accounts-profile-button"]`
- Claude — `[data-testid="user-menu-button"]`
- Gemini — `.mavatar-container` (class-based; flag for D-R4 remote hot-fix)
- Perplexity — `[*|href="#pplx-icon-user-filled"]` (SVG sprite ref; belt-and-suspenders, since Perplexity already passes signed-out)

*Alternative considered:* anchor-tier heuristic alone ("composer present + history absent = signed-out"). Rejected — it misclassifies Claude, whose composer is also absent on `/login`, and it can't distinguish a rotted history selector from a signed-out user.

*Alternative considered:* URL/text signals (`/login`, "Log in"). Rejected — violates the no-text/no-assumed-URL rule and is locale-fragile.

### D2 — Capability tiers drive graceful degradation

Split `REQUIRED_ANCHORS` into two named tiers:
- `COMPOSE = [composer, inputBarAnchor]`
- `WORKSPACE = [conversationList, sidebarAnchor]`

Decision tree on a failed full `selfCheck()`:

```
authedMarker present?
 ├─ yes → BREAKAGE banner (+ existing degraded/telemetry/hotfix path)
 └─ no  → COMPOSE present?
            ├─ yes → compose-only: mount input bar, skip ingest/filing, no banner
            └─ no  → dormant, quiet, no banner
```

This keeps the existing happy path (both tiers present → full activate) untouched, and Perplexity signed-out keeps passing the full check, so it never reaches this tree.

*Why tiers rather than all-or-nothing:* the input bar only needs COMPOSE; binding it to WORKSPACE wastes a usable signed-out composer (ChatGPT/Gemini) and is why Perplexity "accidentally" works. Tiers make that intentional.

### D3 — Fail-quiet when ambiguous

When `authedMarker` is absent we never banner, even if some anchors are missing in a way that *could* be breakage. Accepted because a false banner (today's bug) is the failure mode we are removing, and the canary still re-checks degraded platforms on its own cadence.

### D4 — Suppress degraded/telemetry/hotfix for signed-out

In the not-signed-in branches, do **not** call the degraded-reporting path that sets `hotfixWanted`, and do **not** fire `adapter_fallback_shown(selfcheck_failed)`. Optionally emit `adapter_signed_out` (id-less, consent-gated, scrubbed worker-side like every other diagnostic) so the heuristic's field accuracy is observable without polluting breakage metrics.

### D5 — Early-exit `waitForSelfCheck` on a confident signed-out read

Extend the probe loop to also evaluate `authedMarker`. If anchors are still failing but `authedMarker` is reliably absent (and the COMPOSE tier is resolved or the DOM has settled), resolve early to the quiet path instead of burning the full 8s. The function still never rejects and still returns the final anchor result for the authed/breakage branch. To avoid a premature signed-out verdict mid-hydration, only short-circuit once the COMPOSE tier resolves (ChatGPT/Gemini) or after a short settle window for the dormant case.

### D6 — i18n-safe selectors + CI guard (folded in)

Replace the three `aria-label` selectors with structural equivalents:
- ChatGPT `sidebarAnchor`: `nav[aria-label="Chat history"], nav:has(#history)` → `nav:has(#history)` (clean — rides the stable `#history` id).
- Claude `conversationList`/`sidebarAnchor`: drop `nav[aria-label="Sidebar"]`; target the sidebar `<nav>` container by the stable header `data-testid` → `nav:has([data-testid="pin-sidebar-toggle"])` (the sidebar's pin/close toggle, present whenever the nav is rendered, independent of conversation count).
- Perplexity `conversationList`/`sidebarAnchor`: drop `nav[aria-label="Main"]`; target the structural sidebar spacer → `nav:has([data-testid="collapsed-sidebar-expand-area"])` (present in both collapsed and expanded states, independent of conversation count).

Add a guard test over every shipped config that fails if a selector contains an `[aria-label="…"]` term, a text/`:contains()` match, or an assumed auth/route URL. Conversation `href`-prefix selectors (`a[href^="/c/"]`, `/chat/`, `/search/`) are explicitly allowlisted — they are the conversation identity model, not assumed navigation URLs.

## Risks / Trade-offs

- **`authedMarker` selector rot** (esp. Gemini `.mavatar-container`, Perplexity sprite ref) → with fail-quiet, a genuine breakage would show no banner until the canary catches it. *Mitigation:* single low-surface selector; D-R4 remote hot-fix; optional `adapter_signed_out` rate spike is observable; canary independently re-checks degraded platforms.
- **Authed-but-empty account** (signed in, zero conversations) — *resolved.* The WORKSPACE anchors now key off the stable nav-container `data-testid`s (Claude `pin-sidebar-toggle`, Perplexity `collapsed-sidebar-expand-area`) instead of `nav:has(a[href^=…])`, so WORKSPACE resolves even with zero chats and the empty-account false banner can no longer occur.
- **Compose-only mounts the input bar on a signed-out composer.** Prompt insertion into a logged-out composer is harmless (host prompts login on send) and is already Perplexity's signed-out behavior; the brand button still opens the side panel. Acceptable / arguably desirable.
- **Early-exit mis-timing** could declare signed-out mid-hydration. *Mitigation:* only short-circuit after the COMPOSE tier resolves or a settle window elapses; the authed/breakage path still uses the full timeout.

## Migration Plan

Pure additive config + content-script logic; no stored-data migration. `authedMarker` is optional, so configs without it (and the contract-test fixtures) keep working — absence means "never classified signed-out," i.e. today's behavior. Rollback = revert the change; no persisted state changes shape. Ship behind the normal config version bump so a remote hot-fix can adjust any `authedMarker`/nav selector without a store release.

## Open Questions

- **Resolved:** the Claude and Perplexity sidebar `<nav>` containers are now anchored on stable `data-testid`s — `nav:has([data-testid="pin-sidebar-toggle"])` (Claude) and `nav:has([data-testid="collapsed-sidebar-expand-area"])` (Perplexity) — replacing the `nav:has(a[href^=…])` fallback and removing the authed-but-empty-account edge.
- Should `adapter_signed_out` ship in this change or wait until the heuristic is validated? (Lean: ship it, off-by-default like all diagnostics, to *get* the validation.)
- **Resolved:** `sendButton` stays out of the i18n selector guard by design — it is contract-only surface, not a runtime selector. The overlay is append-only and never auto-submits (design D-5), so `adapter.submit()` (the sole `sendButton` consumer) is never called in the live product. The platforms also expose no stable `data-testid` on their send buttons (Claude is `aria-label`-only; Perplexity's only hook is a namespaced SVG sprite ref the happy-dom parser rejects). When multi-model comparison makes programmatic send a runtime path, the i18n-safe answer is `submitMode:"enter"` (no selector needed), not a send-button testid — the guard is revisited then.
