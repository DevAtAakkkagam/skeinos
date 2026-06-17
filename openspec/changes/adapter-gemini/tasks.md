## 1. Config

- [x] 1.1 Add `extension/src/adapters/configs/gemini.json` with `platformId: "gemini"`, `configVersion: "1.0.0"`, `hostMatch: ["*://gemini.google.com/*"]`, the verified selectors (`conversationList: conversations-list`, `conversationItem: a[href^="/app/"]`, `conversationTitle: .title-text`, `conversationIdAttr: href`, `messageUser: user-query`, `messageAssistant: model-response`, `composer: .ql-editor`, `sendButton: button[aria-label="Send message"]`, `sidebarAnchor: bard-sidenav`, `inputBarAnchor: input-area-v2`), and behaviors `insertMode: execCommand`, `submitMode: click`, `supportsSystemPrompt: false`.
- [x] 1.2 Register `gemini` in `BUNDLED_CONFIGS` in `extension/src/adapters/configs/index.ts` (import `gemini.json`, add the entry).
- [x] 1.3 Verify `matchPlatform("https://gemini.google.com/app/abc123")` returns `"gemini"`.

## 2. Fixture

- [x] 2.1 Add `extension/tests/fixtures/gemini.html` modelling the live structure: a `conversations-list` containing a "New chat" anchor (`href="/app"`, must be excluded) plus ≥2 conversation anchors `a[href^="/app/<id>"]` each wrapping a `.title-text`, with exactly one carrying `aria-current="page"`; an open conversation with ordered `user-query` then `model-response` elements; a `.ql-editor` composer; a `button[aria-label="Send message"]`; and the `bard-sidenav` / `input-area-v2` mount anchors. Use only stable hooks — no `ng-tns-*`/`mat-mdc-*` classes. Scrub account-identifying content.
- [x] 2.2 Add `extension/tests/fixtures/gemini.expected.json` with `activeUrl` (`https://gemini.google.com/app/<id>`), `active` (`nativeId: "/app/<id>"`, title), `conversationCount` (count of `a[href^="/app/"]` excluding "New chat"), ordered role-tagged `messages`, and `inserted` text.
- [x] 2.3 Confirm whether `conversations-list` and its anchors render while the sidebar is collapsed (design Open Question). Record the finding; if they do not render collapsed, note the selfCheck implication in the fixture README and reassess the `conversationList` anchor.

## 3. Contract test

- [x] 3.1 Add `extension/tests/adapter-gemini.test.ts` importing `runAdapterContract` and the Gemini fixture + expectations, mirroring `adapter-claude.test.ts`.
- [x] 3.2 Add a `selfCheck` degradation case: build the adapter against a Gemini fixture with the composer anchor removed and assert `{ ok: false, missing }` names it without throwing.

## 4. Verify

- [x] 4.1 Run `npm run typecheck` and `npm test -- tests/adapter-gemini.test.ts` — green.
- [x] 4.2 Run `npm test` to confirm no regression in the existing adapter/contract suites.
- [ ] 4.3 (Optional, recommended) Load the built extension on a live logged-in `gemini.google.com` tab and confirm the adapter reports ready, lists conversations, and the compose path inserts + submits.
