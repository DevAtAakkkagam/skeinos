## Why

ChatGPT (`chatgpt.com`) is the most-used LLM chat surface our target users keep open, but it has no adapter config and — unlike Claude, Gemini, and Perplexity — its host permission is not yet in the manifest, so the content script never injects there and the overlay never activates. The generic config-driven adapter framework exists precisely so a new platform is a config + fixture and no new code; ChatGPT is the next platform to exercise that promise, and the first to also extend the manifest's host-permission allow-list.

## What Changes

- Add a bundled, schema-valid `AdapterConfig` for ChatGPT (`platformId: "chatgpt"`) driving the existing generic adapter — selectors verified against the live logged-in `chatgpt.com` DOM.
- Register ChatGPT in the bundled-config map so the host router (`host-match.ts`) and content script pick it up automatically on ChatGPT tabs.
- Add `*://chatgpt.com/*` to `P0_MATCHES` in `manifest.config.ts` — the one new host permission. **Justification ([MV3]):** it is the single, specific host the ChatGPT adapter targets; no `<all_urls>`, no credential-bearing permission, no wildcard subdomain. The content script is bounded to exactly this host.
- Add a recorded ChatGPT DOM fixture and expectations file, plus a contract test that runs the shared adapter contract suite against them (mirroring `adapter-perplexity.test.ts`).
- Configure ChatGPT's quirks purely through existing config values: `insertMode: "execCommand"` for its ProseMirror `contenteditable` composer (`#prompt-textarea` — verified live that `document.execCommand('insertText', …)` commits), `submitMode: "click"` against `button[data-testid="send-button"]`, `supportsSystemPrompt: false`, and `listHiddenWhenCollapsed: true` (ChatGPT removes its `nav[aria-label="Chat history"]` from the DOM when the sidebar collapses, like Gemini).
- **No adapter-engine changes.** ChatGPT's open-conversation anchors expose `href="/c/<id>"`, the active item carries `aria-current`, and messages are tagged `data-message-author-role="user"|"assistant"` — the exact conventions the generic adapter already matches — so it fits the existing shape with zero changes to the generic adapter, the `PlatformAdapter` contract, or the resilience pipeline.
- **Surface ChatGPT in the cross-platform pickers.** The prompt-target and profile-scope pickers previously read a per-surface hardcoded `TARGETABLE_PLATFORMS = ['claude','gemini','perplexity']`, so a shipped ChatGPT adapter still did not appear as a selectable target. Introduce a single platform registry (`PLATFORM_REGISTRY` → `SUPPORTED_PLATFORMS` in `shared/branding`) as the one source of truth for the platform list, flip ChatGPT to `supported`, re-export it as `TARGETABLE_PLATFORMS`/`PLATFORM_LABELS` so existing call sites keep their import path, and add a `ChatGptLogo` to `PLATFORM_LOGOS` so the brand mark renders on cards and chips.

## Capabilities

### New Capabilities
- `adapter-chatgpt`: the bundled ChatGPT platform integration — a schema-valid `AdapterConfig`, proof it passes the shared adapter contract suite against recorded ChatGPT fixtures, and confirmation that `selfCheck()` degrades cleanly (reports missing anchors, no throw) on a broken ChatGPT fixture.

### Modified Capabilities
- `extension-shell`: the "Minimum host permissions" requirement enumerates the allowed hosts; ChatGPT (`chatgpt.com`) is added to that allow-list, while the no-`<all_urls>` and no-credential guarantees are unchanged.

## Impact

- **New files:** `extension/src/adapters/configs/chatgpt.json`; `extension/tests/fixtures/chatgpt.html`; `extension/tests/fixtures/chatgpt.expected.json`; `extension/tests/adapter-chatgpt.test.ts`.
- **Modified files:** `extension/src/adapters/configs/index.ts` (register `chatgpt` in `BUNDLED_CONFIGS`); `extension/src/manifest.config.ts` (add `*://chatgpt.com/*` to `P0_MATCHES`); `extension/src/shared/branding.ts` (the new `PLATFORM_REGISTRY`/`SUPPORTED_PLATFORMS`/`PLATFORM_LABELS`, with `chatgpt` supported); `extension/src/ui/components/PlatformLogo.tsx` (`ChatGptLogo` + `PLATFORM_LOGOS["chatgpt"]`); `extension/src/ui/prompts/strings.ts` and `extension/src/ui/profiles/strings.ts` (re-export the registry instead of hardcoding the picker list/labels).
- **No change** to the generic adapter, the `PlatformAdapter` contract, `validate.ts` allow-list, or the resilience pipeline. `PlatformId` already includes `"chatgpt"`.
- **Risks (non-blocking):** (1) ChatGPT removes `nav[aria-label="Chat history"]`/`#history` from the DOM when the sidebar is collapsed, so `selfCheck` may report `conversationList`/`sidebarAnchor` missing until the user expands it — flagged via `listHiddenWhenCollapsed` and cushioned by `waitForSelfCheck` re-probing plus the resilience banner. (2) The send button only renders once the composer is non-empty; this is fine because `submit()` runs after `insertText`, but a bare `selfCheck` of `sendButton` on an empty composer would miss it — `sendButton` is not in `REQUIRED_ANCHORS`, so this does not gate mounting. (3) Some ChatGPT selectors lean on Tailwind utility classes (`.truncate`, `form[class*="composer"]`); drift is absorbed by the existing canary + remote hot-fix config loader.
