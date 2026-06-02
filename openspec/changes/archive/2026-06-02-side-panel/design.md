## Context

Skeinos's UI is a pure view over the service worker: `ui/sidebar/SidebarShell` reads
folder/conversation state and dispatches mutations through `core/messaging` (`send` /
`subscribe`, both `chrome.runtime`-based). Today two surfaces already prove the pattern
as **extension pages**: `entrypoints/options/` mounts a Preact app via the shared
`ui/mount` harness and talks to the worker. The workspace UI, by contrast, is injected
into the host page by the content script (`dockSidebar`, fixed-right + `marginRight`
reflow) — the fragile part this change removes.

`chrome.sidePanel` (Chrome/Edge 114+) renders an extension HTML page in the browser's
side-panel slot. It is an extension-origin page like the options page, so messaging,
`openOptionsPage`, and the FontFace registration all work natively. It cannot read the
host DOM — that stays the content script's job.

WXT 0.20.26 supports a `sidepanel` HTML entrypoint and auto-populates
`manifest.side_panel.default_path` and the `sidePanel` permission.

## Goals / Non-Goals

**Goals:**
- Host the existing `SidebarShell` in the Chrome/Edge side panel, opened from the toolbar.
- Enable the panel only on supported P0 hosts; scope its data to the active tab's platform.
- Reduce the content script to DOM/adapter duties only (no UI injection, no reflow).
- Reuse the messaging, store, folder, and mount code unchanged.

**Non-Goals:**
- Firefox `sidebar_action` (later cross-browser change).
- Changing folder logic, the store, or the worker single-writer contract.
- The input action bar and in-page features (still content-script, unchanged here).
- Removing the shadow-DOM mount harness — it still serves the in-page breakage banner
  and the options page.

## Decisions

### D1 — Side panel is an extension page mounting `SidebarShell`, mirroring `options/`
`entrypoints/sidepanel/{index.html,main.ts}` mounts `SidebarShell` via `ui/mount`, reading
the initial theme from settings — structurally identical to `entrypoints/options/main.ts`.
- *Why:* the options page already proves an extension page + worker messaging + the mount
  harness work together. Maximum reuse, no new UI. Alternative — a bespoke panel bootstrap —
  duplicates the proven path for no gain.

### D2 — Open on toolbar click; enable per supported host
Background calls `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` at
load, and on `tabs.onUpdated`/`onActivated` calls `setOptions({ tabId, enabled })` —
enabled on P0 hosts, disabled elsewhere. Registered synchronously at worker load (SW-3) so
it survives cold starts.
- *Why:* matches the DeepL-style "click the icon → panel opens" and keeps the panel from
  appearing on irrelevant pages. Alternative — always-global — shows an empty panel on every
  site. Per-host enablement is the lighter UX.

### D3 — Platform scoping from the active tab
The panel resolves its platform by querying the active tab's URL through `matchPlatform`,
and re-queries on `tabs.onActivated`/`onUpdated`. Until a supported tab is active it shows a
neutral "open a supported chat" state.
- *Why:* the panel is a single global document but folder data is platform-scoped. Reading
  the active tab is the canonical way a global panel learns its context. Requires `tabs`
  (or `activeTab`) to read the URL — justified and host-access-free. Alternative — the content
  script pushes its platform to the worker and the panel reads it — adds a round-trip and a
  new message kind; deferred unless tab-reading proves insufficient.

### D4 — Content script becomes DOM-only
`content/index.ts` drops `dockSidebar`; it keeps `matchPlatform` → `loadConfig` → `selfCheck`
→ `reportHealth` → banner-on-failure, and conversation ingest. `dockSidebar`, `SIDEBAR_WIDTH`,
and the `marginRight` reflow are removed from `mountSidebar.tsx` (the `mountSidebar(target,…)`
embed helper is retained for tests and any future in-page embed).
- *Why:* the side panel owns the UI now; the content script's only unique capability is host
  DOM access. Removing the reflow eliminates the per-host fragility this change is motivated by.

### D5 — Keep the shadow-DOM mount harness; record the D3/D5 departure
The mount harness still serves the breakage banner (in-page) and the options page; the side
panel reuses it too (harmless: a shadow root inside an extension page). `docs/DECISIONS.md`
gets an entry noting the workspace UI moved from in-page overlay to the side panel, superseding
the "shadow-DOM overlay mounted in the page" reading of D3/D5 for the workspace surface.
- *Why:* DECISIONS.md is the authoritative log that overrides the planning docs; an explicit
  entry keeps the source of truth honest rather than silently diverging.

## Risks / Trade-offs

- **Chrome-only API** (Firefox lacks `chrome.sidePanel`) → scoped out here; the build stays
  Firefox-loadable because WXT only emits `side_panel` for Chromium targets. Firefox gets
  `sidebar_action` in a later change; until then Firefox has no workspace UI (acceptable —
  P0 launch is Chromium).
- **Active-tab scoping races** (panel open, user switches to a non-host tab) → the panel shows
  the neutral state rather than stale data; `onActivated`/`onUpdated` re-scope. Covered by a test.
- **`tabs` permission optics** (privacy-first positioning) → we read only the active tab's URL
  to pick a platform, never content; documented in the proposal and DECISIONS. If review prefers,
  `activeTab` + a content-script-pushed platform (D3 alternative) avoids the broad `tabs` read.
- **Losing the in-page collapse rail** → the browser's own panel close/width controls largely
  replace it; the in-panel collapse toggle still works for a narrow rail. No functionality lost.
- **Two extension pages now mount the shell-family UI** (options + side panel) → both go through
  one mount harness and one messaging layer, so they cannot diverge structurally.
