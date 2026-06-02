## 1. Manifest + permission

- [x] 1.1 Add `sidePanel` to `permissions` in `manifest.config.ts` (and surface via `wxt.config.ts`)
- [x] 1.2 Confirm WXT emits `side_panel.default_path` for the new entrypoint in the built Chrome manifest

## 2. Side-panel entrypoint

- [x] 2.1 Create `src/entrypoints/sidepanel/index.html` (mirrors `options/index.html`)
- [x] 2.2 Create `src/entrypoints/sidepanel/main.ts`: read initial theme from settings, mount `SidebarShell` via `ui/mount` (mirrors `options/main.ts`)

## 3. Background: open behavior + per-host enablement

- [x] 3.1 In `background/index.ts`, register `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` synchronously at worker load (SW-3)
- [x] 3.2 On `tabs.onUpdated`/`onActivated`, call `chrome.sidePanel.setOptions({ tabId, enabled })` — enabled on P0 hosts (`matchPlatform`), disabled otherwise; guard for the API's absence (non-Chromium)

## 4. Platform scoping from the active tab

- [x] 4.1 In the side-panel app, resolve the active platform from the active tab's URL via `matchPlatform`; re-resolve on `tabs.onActivated`/`onUpdated`
- [x] 4.2 Render a neutral "open a supported chat" state when no supported host tab is active; pass the resolved platform into `SidebarShell`
- [x] 4.3 Add the minimum permission needed to read the active tab's URL (`tabs` or `activeTab`) to the manifest with a justification

## 5. Content script becomes DOM-only

- [x] 5.1 Remove `dockSidebar`, `SIDEBAR_WIDTH`, and the `marginRight` reflow from `ui/sidebar/mountSidebar.tsx` (keep the `mountSidebar(target, …)` embed helper for tests)
- [x] 5.2 Update `content/index.ts` to stop mounting the sidebar; keep `matchPlatform → loadConfig → selfCheck → reportHealth`, banner-on-failure, and conversation ingest

## 6. Docs

- [x] 6.1 Add a `docs/DECISIONS.md` entry: workspace UI moved from in-page overlay to the browser side panel, superseding the in-page reading of D3/D5 for the workspace surface; banner + options page keep the shadow-DOM mount

## 7. Tests + validation

- [x] 7.1 Manifest test: built manifest declares the side-panel path and the `sidePanel` permission, no new host permissions
- [x] 7.2 Side-panel mount test: the entrypoint mounts `SidebarShell` and wires worker messaging (reuse the options-page test pattern)
- [x] 7.3 Platform-scoping test: panel reflects the active host and falls back to the neutral state with no supported tab
- [x] 7.4 Content-script test: on a supported host the script runs and ingests but mounts no workspace UI
- [x] 7.5 Run `openspec validate side-panel`, type-check, build, and the full unit + browser suites green
