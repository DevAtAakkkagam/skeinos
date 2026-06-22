## 1. Config

- [x] 1.1 Add `extension/src/adapters/configs/chatgpt.json` with `platformId: "chatgpt"`, `hostMatch: ["*://chatgpt.com/*"]`, the verified selectors (composer `#prompt-textarea`, sendButton `button[data-testid="send-button"]`, conversationList `#history`, conversationItem `a[href^="/c/"]`, conversationTitle `.truncate`, conversationIdAttr `href`, conversationUrlPattern `/c/[^/?#]+`, messageUser/Assistant `[data-message-author-role="user"|"assistant"]`, sidebarAnchor `nav[aria-label="Chat history"]`, inputBarAnchor `form[class*="composer"]`) and behaviors (`insertMode: "execCommand"`, `submitMode: "click"`, `supportsSystemPrompt: false`, `listHiddenWhenCollapsed: true`).
- [x] 1.2 Register `chatgpt` in `BUNDLED_CONFIGS` in `extension/src/adapters/configs/index.ts` (import + map entry).

## 2. Manifest host permission

- [x] 2.1 Add `*://chatgpt.com/*` to `P0_MATCHES` in `extension/src/manifest.config.ts`, keeping the justification comment ([MV3]: single specific host, no `<all_urls>`, no credential permission).

## 3. Fixture & contract test

- [x] 3.1 Add `extension/tests/fixtures/chatgpt.html` — a recorded, scrubbed snapshot with the `nav[aria-label="Chat history"]`/`#history` list (≥2 `a[href^="/c/"]` items, the active one carrying `aria-current="page"`), ordered `data-message-author-role` user/assistant messages, and the `form[class*="composer"]` containing `#prompt-textarea` and `button[data-testid="send-button"]`.
- [x] 3.2 Add `extension/tests/fixtures/chatgpt.expected.json` (`activeUrl`, `active` {nativeId `/c/conv-1`, title `Rump steaks`}, `conversationCount: 2`, ordered `messages`, `inserted`).
- [x] 3.3 Add `extension/tests/adapter-chatgpt.test.ts` mirroring `adapter-perplexity.test.ts`: config-valid assertion, `matchPlatform` resolves a chatgpt.com URL to `"chatgpt"`, `runAdapterContract` against the fixture, and a broken-fixture `selfCheck` test (composer removed → `ok: false`, `missing` includes `composer`, no throw).

## 4. Surface ChatGPT in the cross-platform pickers

- [x] 4.1 Add a single platform registry in `extension/src/shared/branding.ts` (`PLATFORM_REGISTRY` → derived `SUPPORTED_PLATFORMS`, `PLATFORM_LABELS`, `PLATFORM_ORIGINS`) with `chatgpt` flipped to `supported: true`; it is the one source of truth for the platform list.
- [x] 4.2 Re-export the registry from `extension/src/ui/prompts/strings.ts` (`SUPPORTED_PLATFORMS as TARGETABLE_PLATFORMS`, `PLATFORM_LABELS`) and `extension/src/ui/profiles/strings.ts` (`PLATFORM_LABELS`), replacing the hardcoded `['claude','gemini','perplexity']` list/labels so the prompt-target and profile-scope pickers offer ChatGPT.
- [x] 4.3 Add `ChatGptLogo` and register `PLATFORM_LOGOS["chatgpt"]` in `extension/src/ui/components/PlatformLogo.tsx` so the ChatGPT brand mark renders on cards and picker chips.

## 5. Verify

- [x] 5.1 Run `npm run typecheck` and `npm test` (includes the new contract test) — both green.
- [x] 5.2 Run `npm run lint` — clean.
- [x] 5.3 Manual smoke on `chatgpt.com` (dev build): overlay mounts, sidebar lists chats, active chat highlights, input bar docks above the composer, insert + send works, and collapsing the sidebar triggers the expand nudge rather than a crash.
- [x] 5.4 Manual check: ChatGPT appears (with its logo) as a selectable target in the prompt add/edit and profile add/edit forms, and saving persists it.
