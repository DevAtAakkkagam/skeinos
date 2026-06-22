// Inject the content script into already-open supported tabs on install/update.
//
// Content scripts auto-inject only on a page LOAD. When the extension is freshly
// installed or updated (a dev "Reload" counts), tabs already sitting on claude.ai /
// gemini.google.com / *.perplexity.ai have NO running content script until the user
// reloads them — so their conversations are never ingested and the panel stays
// empty. That breaks the local-first promise that a user's open chats "just appear".
// This module closes the gap: on `onInstalled` it finds every open P0 tab and
// injects the content script once, so existing tabs start ingesting with no manual
// reload.
//
// Trigger is `onInstalled` (install/update) ONLY — deliberately NOT a cold-start
// wake. On a normal worker wake the open tabs already carry the content script from
// their page load, so re-injecting would double-wire the adapter observers. (A
// re-entrancy guard in `runContent` is the backstop if an inject ever overlaps a
// live context.) `onStartup` is likewise unnecessary: restored tabs auto-inject on
// their own load.

import { P0_MATCHES } from '../manifest.config';
import { extApi } from '../core/platform/ext-api';

// WXT emits each content entry to `content-scripts/<entry>.js` in the build output;
// these are stable as long as the entrypoints keep their names. The page bridge runs
// in the MAIN world (see skeinos-page.content.ts) and must be injected there too.
const CONTENT_SCRIPT_FILE = 'content-scripts/skeinos.js';
const PAGE_BRIDGE_FILE = 'content-scripts/skeinos-page.js';

interface ScriptingApi {
  executeScript?(opts: {
    target: { tabId: number };
    files: string[];
    world?: 'ISOLATED' | 'MAIN';
  }): Promise<unknown> | void;
}
interface TabLike {
  id?: number;
  url?: string;
}
interface TabsQueryApi {
  query?(info: { url: string[] }): Promise<TabLike[]>;
}
interface RuntimeOnInstalled {
  addListener(cb: (details: { reason?: string }) => void): void;
}

function scriptingApi(): ScriptingApi | undefined {
  return extApi<{ scripting?: ScriptingApi }>()?.scripting;
}
function tabsApi(): TabsQueryApi | undefined {
  return extApi<{ tabs?: TabsQueryApi }>()?.tabs;
}
function onInstalledApi(): RuntimeOnInstalled | undefined {
  return extApi<{ runtime?: { onInstalled?: RuntimeOnInstalled } }>()?.runtime?.onInstalled;
}

/** Query every open P0 tab and inject the content script into each. The `url`
 *  filter is satisfied by our existing host permissions (no `tabs` permission), so
 *  only the three supported hosts are ever touched. Best-effort per tab: a
 *  chrome:// page, a discarded tab, or one closed mid-flight is skipped, never fatal. */
export async function injectOpenTabs(): Promise<void> {
  const scripting = scriptingApi();
  const tabs = tabsApi();
  if (!scripting?.executeScript || !tabs?.query) return; // e.g. Firefox MV2: no scripting API.

  let open: TabLike[];
  try {
    open = await tabs.query({ url: [...P0_MATCHES] });
  } catch (err) {
    console.warn('[Skeinos] injectOpenTabs: tab query failed', err);
    return;
  }

  for (const tab of open) {
    if (tab.id == null) continue;
    try {
      await scripting.executeScript({ target: { tabId: tab.id }, files: [CONTENT_SCRIPT_FILE] });
      // Best-effort: the MAIN-world bridge powers Lexical clears. A failure here (e.g.
      // a host CSP blocking MAIN injection) must not stop the isolated script above.
      await scripting.executeScript({
        target: { tabId: tab.id },
        files: [PAGE_BRIDGE_FILE],
        world: 'MAIN',
      });
      console.log('[Skeinos] injected content script into open tab', tab.url);
    } catch (err) {
      console.warn('[Skeinos] injectOpenTabs: executeScript failed', tab.url, err);
    }
  }
}

/** Register the install/update hook. Top-level side effect (SW-3): the listener must
 *  exist before the `onInstalled` event the worker is woken to deliver. */
export function registerInjectOpenTabs(): void {
  const installed = onInstalledApi();
  if (!installed) return;
  installed.addListener((details) => {
    // Only a genuine install/update orphans the old content scripts in open tabs;
    // chrome_update / shared_module_update don't, and their tabs reload normally.
    if (details.reason === 'install' || details.reason === 'update') void injectOpenTabs();
  });
}
