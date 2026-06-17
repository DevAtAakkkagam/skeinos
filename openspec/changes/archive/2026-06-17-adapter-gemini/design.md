## Context

The adapter framework (archived `adapter-framework` + `adapter-resilience`) is built so a new platform is **one bundled config + a recorded fixture + a contract test, with no new runtime code**. One generic adapter (`adapters/runtime/adapter.ts`) reads an `AdapterConfig`'s selectors/behaviors; `host-match.ts` routes any URL to the platform whose config claims it; the content script self-checks, reports health, and raises a resilience banner on failure.

All Gemini plumbing already exists: `*://gemini.google.com/*` is in `manifest.config.ts` `P0_MATCHES` (so the content script already registers on Gemini tabs and the host permission is granted), `'gemini'` is already in the `shared/types.ts` `PlatformId` union and the `validate.ts` allow-list. The only missing piece is the config + fixture + its registration in `BUNDLED_CONFIGS`.

Selectors below were captured and verified against the **live, logged-in** `gemini.google.com` DOM (Playwright + console probes during exploration), not inferred.

## Goals / Non-Goals

**Goals:**
- Ship a schema-valid Gemini `AdapterConfig` that drives the existing generic adapter (detect/list/read/compose/submit/observe) with no platform-specific code.
- Prove it against the shared contract suite with a recorded Gemini fixture, and prove `selfCheck()` degrades cleanly on a broken fixture.

**Non-Goals:**
- No changes to the generic adapter, the `PlatformAdapter` contract, the resilience pipeline, manifest, or permissions.
- No generalization of `AdapterConfig` (see Decisions — explicitly considered and rejected).
- No Gemini-specific features (model switcher, system prompt, attachments) — `supportsSystemPrompt: false`.

## Decisions

### D1 — Target the inner `<a>`, not the wrapper; ship as pure config (no engine change)

Gemini's sidebar conversation row is a `<div data-test-id="conversation">` **wrapper** that carries no id and no active marker. Probing only that wrapper suggested we'd need to generalize `AdapterConfig` with `activeMarker`/`idSource` knobs and widen `observe()`'s `attributeFilter`.

Deeper probing showed the wrapper contains an inner **`<a href="/app/<id>">`**, and the *open* conversation's anchor carries **`aria-current="page"`**. That is exactly the convention the generic adapter already encodes:
- `activeItem()` matches `[aria-current], [data-active="true"]` → matches Gemini's open anchor.
- `refFromItem()` reads `conversationIdAttr` → `href` yields `nativeId = "/app/<id>"` (same shape as Claude's `/chat/<id>`).
- `observe()`'s `attributeFilter: ['aria-current','data-active']` already watches the marker that flips on navigation.

So `conversationItem: a[href^="/app/"]` makes Gemini structurally identical to Claude (`a[href^="/chat/"]`). The proposed `activeMarker`/`idSource` generalization was **dropped** — it would add config surface and a one-time engine change for zero benefit. *Alternative considered:* generalize the config now for platforms 3–7; rejected as speculative — revisit only when a real platform breaks the `aria-current`/`href` convention.

The trailing slash in `a[href^="/app/"]` excludes the "New chat" entry (`href="/app"`) so only real conversations are listed.

### D2 — `insertMode: "execCommand"` for the Quill `contenteditable` composer

Gemini's composer is `.ql-editor`, a Quill `contenteditable` div (not a form field). Claude's `react-set` path (native value setter on `HTMLTextAreaElement`/`HTMLInputElement`) returns null for `contenteditable` and would only set `textContent`, which Quill ignores. Verified live: `document.execCommand('insertText', …)` commits text into `.ql-editor` and Gemini reacts (the send button appears). `execCommand` is an existing supported `InsertMode`, so this is config, not code. `submitMode: "click"` against `button[aria-label="Send message"]` (which renders once the composer is non-empty).

### D3 — Selectors use only framework-stable hooks, never classes

Every Gemini CSS class is Angular-generated and volatile (`ng-tns-c2639755531-11`, `mat-mdc-*`). The config uses only: custom-element tags (`conversations-list`, `user-query`, `model-response`, `bard-sidenav`, `input-area-v2`), `aria-label`s (`button[aria-label="Send message"]`), `data-test-id`s, and `href` prefixes. The one class-like selector, `.title-text`, is a semantic content class inside the anchor (not a generated hash) and is read only for the title.

### Verified config (`gemini.json`)

| key | value |
|---|---|
| `conversationList` | `conversations-list` |
| `conversationItem` | `a[href^="/app/"]` |
| `conversationTitle` | `.title-text` |
| `conversationIdAttr` | `href` |
| `messageUser` | `user-query` |
| `messageAssistant` | `model-response` |
| `composer` | `.ql-editor` |
| `sendButton` | `button[aria-label="Send message"]` |
| `sidebarAnchor` | `bard-sidenav` |
| `inputBarAnchor` | `input-area-v2` |
| `behaviors` | `insertMode: execCommand`, `submitMode: click`, `supportsSystemPrompt: false` |

## Risks / Trade-offs

- **Collapsed sidebar hides the list** → `conversations-list`/its anchors may not be in the DOM while the sidebar is collapsed, so `selfCheck` (which requires `conversationList`) could fail until the user expands it. Mitigation: `waitForSelfCheck` re-probes on DOM mutations within a bounded timeout, and a genuine miss raises the isolated resilience banner with Retry — no crash, no effect on other tabs. Confirm collapsed-state rendering when authoring the fixture/spec.
- **Selector drift** (Gemini ships DOM changes frequently) → Mitigation: the production canary flags drift and the loader adopts a newer remote hot-fix config without a store release; the bundled config is the offline last-known-good.
- **Title-only ingest fidelity** → `nativeId` is stable per conversation (`/app/<id>`), so `conversation.ingest` keys correctly; no risk beyond Claude's.

## Open Questions

- Does `conversations-list` render (empty or populated) when the sidebar is collapsed? Resolve while recording the fixture; if it does not, consider whether `conversationList` should anchor to an always-present ancestor. Does not block the config — only the selfCheck edge.
