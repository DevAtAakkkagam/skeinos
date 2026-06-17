## Why

Gemini (`gemini.google.com`) is a P0 launch platform — its host permission already ships in the manifest, but no adapter config exists, so the content script self-checks against nothing and the overlay never activates there. The generic config-driven adapter framework was built precisely so a new platform is a config + fixture and no new code; Gemini is the first platform to exercise that promise beyond Claude.

## What Changes

- Add a bundled, schema-valid `AdapterConfig` for Gemini (`platformId: "gemini"`) driving the existing generic adapter — selectors verified against the live logged-in `gemini.google.com` DOM.
- Register Gemini in the bundled-config map so the host router (`host-match.ts`) and content script pick it up automatically on Gemini tabs.
- Add a recorded Gemini DOM fixture and an expectations file, and a contract test that runs the shared adapter contract suite against them.
- Configure Gemini's quirks purely through existing config values: `insertMode: "execCommand"` for its Quill `contenteditable` composer (verified — the React/native-value path does not commit to `contenteditable`), `submitMode: "click"`, `supportsSystemPrompt: false`.
- **No runtime code changes.** Gemini's open-conversation anchor exposes `href="/app/<id>"` and `aria-current="page"` — the exact convention the generic adapter already matches — so it fits Claude's shape with zero adapter-engine changes.

## Capabilities

### New Capabilities
- `adapter-gemini`: the bundled Gemini platform integration — a schema-valid `AdapterConfig`, proof it passes the shared adapter contract suite against recorded Gemini fixtures, and confirmation that `selfCheck()` degrades cleanly (reports missing anchors, no throw) on a broken Gemini fixture.

### Modified Capabilities
<!-- None. The generic adapter, platform-adapter contract, manifest host permissions, and resilience pipeline are unchanged — Gemini ships entirely as config + fixture. -->

## Impact

- **New files:** `extension/src/adapters/configs/gemini.json`; `extension/tests/fixtures/gemini.html`; `extension/tests/fixtures/gemini.expected.json`; `extension/tests/adapter-gemini.test.ts`.
- **Modified file:** `extension/src/adapters/configs/index.ts` (register `gemini` in `BUNDLED_CONFIGS`).
- **No change** to the generic adapter, `PlatformAdapter` contract, manifest/permissions (`*://gemini.google.com/*` already in `P0_MATCHES`), `validate.ts` allow-list, or the resilience pipeline.
- **Risks (non-blocking):** (1) the sidebar conversation list (`conversations-list`) may not render its anchors while the sidebar is collapsed, so `selfCheck` could fail until the user expands it — cushioned by `waitForSelfCheck` re-probing and the resilience banner; (2) all Gemini CSS classes are framework-volatile (`ng-tns-*`, `mat-mdc-*`), so the config uses only custom-element tags, `aria-label`s, `data-test-id`s, and `href` prefixes — never classes; selector drift is absorbed by the existing canary + remote hot-fix config loader.
