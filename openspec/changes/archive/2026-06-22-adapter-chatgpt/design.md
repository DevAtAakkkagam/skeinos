## Context

The generic, config-driven `PlatformAdapter` (`adapters/runtime/adapter.ts`) already drives Claude, Gemini, and Perplexity with no per-platform branches — a platform is an `AdapterConfig` (selectors + behaviors) plus a recorded DOM fixture proven against the shared contract suite (`tests/adapter-contract.ts`). ChatGPT is the next platform. `PlatformId` already lists `"chatgpt"`; the gaps are the bundled config, its registration, the manifest host permission (not yet present, unlike the other three), and the fixture/test.

Selectors and behaviors below were captured live from a logged-in `chatgpt.com` session (console DOM probes), not guessed.

## Goals / Non-Goals

**Goals:**
- Ship a schema-valid `chatgpt.json` so the overlay activates on `chatgpt.com` with zero adapter-engine code changes.
- Prove it against the shared contract suite with a recorded, scrubbed fixture.
- Extend the manifest host-permission allow-list by exactly one host, with an auditable justification.

**Non-Goals:**
- No changes to the generic adapter, the `PlatformAdapter` contract, `validate.ts`, or the resilience pipeline.
- No system-prompt injection for ChatGPT (`supportsSystemPrompt: false`).
- No `chat.openai.com` legacy host (scoped to `chatgpt.com`, per the host decision for this change).

## Decisions

**Composer / insert mode → `execCommand`.** The composer is a ProseMirror `contenteditable` div (`#prompt-textarea`, `role="textbox"`). Live probe confirmed `document.execCommand('insertText', false, …)` commits text and renders the send button — so `insertMode: "execCommand"`, matching Gemini's Quill composer rather than Claude's `react-set`. Alternative (`react-set` / native value setter) rejected: ChatGPT's editor is contenteditable, not a controlled `<textarea>`, so the value-setter path does not apply.

**Submit → `click` on `button[data-testid="send-button"]`.** Verified the button carries `data-testid="send-button"` (id `composer-submit-button`, `aria-label="Send prompt"`) once the composer is non-empty. `submit()` runs after `insertText`, so the button exists at click time. Alternative (`submitMode: "enter"` dispatching a synthetic `keydown`) rejected: synthetic, untrusted key events are unreliable against ProseMirror's handlers; a real button click is deterministic.

**Conversation identity → `href` prefix `/c/`, no-capture URL pattern.** Items are `a[href^="/c/"]`; `conversationIdAttr: "href"` yields `"/c/<id>"`. `conversationUrlPattern: "/c/[^/?#]+"` (no capture group, matching Claude's style) returns `m[0]` = the full `"/c/<id>"`, which equals the list item's `href` so URL-derived detection and list highlighting agree. Title comes from the item's `.truncate > span` child text.

**Mount anchors.** `sidebarAnchor: nav[aria-label="Chat history"]`, `conversationList: #history`, `inputBarAnchor: form[class*="composer"]`. These are the stable structural wrappers found by walking up from a conversation link and from the composer.

**`listHiddenWhenCollapsed: true`.** ChatGPT tears `nav[aria-label="Chat history"]`/`#history` out of the DOM when the sidebar collapses to the tiny rail (`#stage-sidebar-tiny-bar` remains). Same shape as Gemini — set the flag so the side panel can nudge the user to expand the drawer once to sync, rather than silently showing an empty list.

## Risks / Trade-offs

- **[Collapsed sidebar removes the list anchors]** → `conversationList`/`sidebarAnchor` are in `REQUIRED_ANCHORS`, so `selfCheck` reports them missing while collapsed and the overlay degrades. Mitigated by `listHiddenWhenCollapsed` (nudge), `waitForSelfCheck` re-probing on DOM mutation, and the isolated resilience banner with Retry — no crash, no effect on other tabs.
- **[Send button absent on an empty composer]** → `sendButton` is intentionally NOT in `REQUIRED_ANCHORS`, so mounting is not gated on it; it materializes before `submit()` is ever called.
- **[Tailwind utility-class selectors drift]** (`.truncate`, `form[class*="composer"]`) → absorbed by the production canary (change `adapter-resilience`) plus the remote hot-fix config loader; a drift is a config bump, not a store release. Where a stable hook existed (`#prompt-textarea`, `data-message-author-role`, `aria-label`, `href` prefix) it was preferred over a class.
- **[New host permission widens attack surface]** → bounded to exactly `*://chatgpt.com/*`; no `<all_urls>`, no wildcard subdomain, no credential permission. Justification recorded in the proposal and the `extension-shell` spec delta.
