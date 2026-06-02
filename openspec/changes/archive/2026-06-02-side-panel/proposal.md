## Why

The workspace UI currently injects itself into the host page and reflows the page
left to dock on the right edge. That is invasive and per-host fragile (every
platform lays out differently; the `marginRight` reflow is a hack), and it does not
match how comparable extensions (e.g. DeepL) present a persistent workspace — they
use the browser's **native side panel** (`chrome.sidePanel`), which is part of the
browser chrome: pinnable, consistent across every host, surviving navigation, with
no page-reflow tricks. Skeinos's UI is already a pure view over the service worker
via `chrome.runtime` messaging, so it maps onto a side-panel extension page almost
unchanged. Moving there removes the fragility and gives the cleaner UX the design's
"page reflows left, no overlap" intent describes.

## What Changes

- Add a **Chrome/Edge side-panel entrypoint** (`entrypoints/sidepanel/`) that mounts
  the existing `SidebarShell` as an extension page — talking to the worker through
  the same `send`/`subscribe` messaging the overlay used.
- Add the **`sidePanel` permission** and wire the background to open the panel on
  toolbar-action click (`chrome.sidePanel.setPanelBehavior`) and to enable it only on
  supported P0 hosts (`setOptions` per tab), disabling elsewhere.
- The side panel **picks the active tab's platform** (via `tabs` query + `matchPlatform`)
  so platform-scoped workspace data is correct, and re-scopes when the active tab changes.
- **BREAKING (internal):** the content script becomes **DOM-only** — it no longer mounts
  or docks any workspace UI. It keeps adapter duties: conversation ingest, health
  reporting, the breakage banner, and (later) the input action bar. `dockSidebar` and
  the host-page reflow are removed.
- Record the surface change in `docs/DECISIONS.md` (it departs from D3/D5 "shadow-DOM
  overlay mounted in the page" — the shadow-DOM mount harness is retained for the
  in-page banner and the options page, but the workspace UI now lives in the side panel).
- Firefox (`sidebar_action`) is **out of scope** here; noted as the later cross-browser path.

## Capabilities

### New Capabilities
- `side-panel`: The browser side-panel surface — an extension page hosting the
  workspace UI, opened from the toolbar action, enabled on supported hosts, scoped to
  the active tab's platform, and kept in sync with the worker via messaging.

### Modified Capabilities
- `extension-shell`: Add the `sidePanel` permission and the side-panel entrypoint to
  the manifest; the content-script-injection requirement is narrowed to DOM/adapter
  duties (it no longer injects workspace UI).
- `sidebar-shell`: The shell renders in the browser side panel instead of being docked
  into the host page; the "panel docks outboard / host reflows left" requirement is
  removed in favour of the native side panel.

## Impact

- **Code:** new `src/entrypoints/sidepanel/{index.html,main.ts}` (mirrors `options/`);
  `src/background/index.ts` adds panel-behavior + per-host enablement; `src/content/index.ts`
  drops `dockSidebar` and becomes DOM-only; `src/ui/sidebar/mountSidebar.tsx` loses
  `dockSidebar`/`SIDEBAR_WIDTH`/reflow.
- **Manifest:** `manifest.config.ts` / `wxt.config.ts` gain `sidePanel` permission and the
  side-panel entrypoint (WXT auto-wires `side_panel.default_path`).
- **Permissions:** adds `sidePanel` (no host access; user-initiated open). `tabs` may be
  needed to read the active tab's URL for platform scoping — justified in the proposal.
- **Docs:** `docs/DECISIONS.md` updated.
- **Tests:** side-panel mount/messaging tests; manifest tests assert the permission +
  entrypoint; content-script tests updated for DOM-only behaviour (no UI mount).
- **No changes** to the store, folder logic, or the worker's single-writer contract.
