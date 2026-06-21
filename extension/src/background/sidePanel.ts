// Side-panel open behavior + per-host enablement (the `side-panel` change, D2).
//
// `chrome.sidePanel` is Chromium-only (Chrome/Edge 114+); every call is guarded
// so the worker stays loadable on Firefox, where the API is absent and there is
// simply no side panel. Registered as a synchronous top-level side effect at
// worker load (SW-3) — the `setPanelBehavior` call and the tab listeners must
// exist on every cold start, before any async init.

import { matchPlatform } from '../adapters/runtime/host-match';
import { isOpenSidePanelMessage } from '../shared/sidepanel';

// The side-panel page path (WXT emits this from `entrypoints/sidepanel/`; it is
// also the manifest `side_panel.default_path`). Passed explicitly when enabling a
// tab so the per-tab option always has a page to show.
const PANEL_PATH = 'sidepanel.html';

interface SidePanelApi {
  setPanelBehavior?(opts: { openPanelOnActionClick: boolean }): Promise<void> | void;
  setOptions?(opts: { tabId: number; path?: string; enabled: boolean }): Promise<void> | void;
  open?(opts: { tabId?: number; windowId?: number }): Promise<void> | void;
}
interface TabLike {
  id?: number;
  url?: string;
}
interface TabsApi {
  get?(tabId: number): Promise<TabLike>;
  query?(info: { active: boolean; lastFocusedWindow?: boolean }): Promise<TabLike[]>;
  onActivated?: { addListener(cb: (info: { tabId: number }) => void): void };
  onUpdated?: {
    addListener(
      cb: (
        tabId: number,
        changeInfo: { status?: string; url?: string },
        tab: { url?: string },
      ) => void,
    ): void;
  };
}
/** The sender carried by a `runtime.onMessage` frame — we only need its tab. */
interface MessageSender {
  tab?: { id?: number; windowId?: number };
}
interface RuntimeApi {
  onMessage?: {
    addListener(
      cb: (message: unknown, sender: MessageSender, sendResponse: (r: unknown) => void) => boolean | void,
    ): void;
  };
}

function sidePanelApi(): SidePanelApi | undefined {
  return (globalThis as { chrome?: { sidePanel?: SidePanelApi } }).chrome?.sidePanel;
}
function tabsApi(): TabsApi | undefined {
  return (globalThis as { chrome?: { tabs?: TabsApi } }).chrome?.tabs;
}
function runtimeApi(): RuntimeApi | undefined {
  return (globalThis as { chrome?: { runtime?: RuntimeApi } }).chrome?.runtime;
}

/** Enable the panel on supported P0 hosts, disable it on every other tab. A tab
 *  whose URL we cannot read (no host permission for it) is treated as unsupported. */
async function syncTab(tabId: number, url: string | undefined): Promise<void> {
  const panel = sidePanelApi();
  if (!panel?.setOptions || tabId < 0) return;
  const enabled = url ? matchPlatform(url) !== null : false;
  try {
    // Pass the path on enable so the per-tab option always resolves to our page.
    await panel.setOptions(enabled ? { tabId, path: PANEL_PATH, enabled: true } : { tabId, enabled: false });
  } catch (err) {
    // A tab can be closed between the event firing and this call; log + ignore.
    console.warn('[Skeinos] sidePanel.setOptions failed', err);
  }
}

/** Resolve the active tab and sync its enablement — covers the tab that was
 *  already open/active when the worker cold-started (no event fires for it). */
async function syncActiveTab(): Promise<void> {
  const tabs = tabsApi();
  if (!tabs?.query) return;
  try {
    const [tab] = await tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.id != null) await syncTab(tab.id, tab.url);
  } catch (err) {
    console.warn('[Skeinos] sidePanel active-tab sync failed', err);
  }
}

export function registerSidePanel(): void {
  const panel = sidePanelApi();
  if (!panel) return; // non-Chromium (e.g. Firefox): no side panel API.

  // Clicking the toolbar action opens the panel (design D2).
  void Promise.resolve(panel.setPanelBehavior?.({ openPanelOnActionClick: true })).catch((err) =>
    console.warn('[Skeinos] sidePanel.setPanelBehavior failed', err),
  );

  // The in-page Skeinos brand mark is a second way to open the panel: the input bar
  // fires `OPEN_SIDE_PANEL` from its click handler, and we open the panel for the
  // sender's tab. `sidePanel.open()` only runs inside a user gesture — Chrome forwards
  // the brand-click activation with the message, so we MUST call `open` synchronously
  // here (no intervening await) or the activation is spent. We read the tab straight
  // off the sender rather than querying for the active tab for the same reason.
  runtimeApi()?.onMessage?.addListener((message, sender) => {
    if (!isOpenSidePanelMessage(message)) return undefined; // not ours — let the hub see it
    const tabId = sender.tab?.id;
    const windowId = sender.tab?.windowId;
    const target = tabId != null ? { tabId } : windowId != null ? { windowId } : undefined;
    // A panel disabled for this tab, or an expired gesture, rejects — log and ignore
    // (the brand click simply does nothing) rather than surfacing an error.
    if (target) {
      void Promise.resolve(panel.open?.(target)).catch((err) =>
        console.warn('[Skeinos] sidePanel.open failed', err),
      );
    }
    return undefined; // one-way control message; no response
  });

  // Enable the panel for the tab that is already active at worker start; the
  // listeners below only cover *subsequent* tab switches/navigations.
  void syncActiveTab();

  const tabs = tabsApi();
  // Re-evaluate enablement when the active tab changes…
  tabs?.onActivated?.addListener(({ tabId }) => {
    void tabs.get?.(tabId).then((t) => syncTab(tabId, t?.url));
  });
  // …or the active tab navigates (SPA URL change or a full load completing).
  tabs?.onUpdated?.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url || changeInfo.status === 'complete') {
      void syncTab(tabId, tab?.url ?? changeInfo.url);
    }
  });
}
