// Open a filed conversation in the active tab. The side panel is scoped to the
// active tab's platform (SidePanelApp), so a conversation's `nativeId` — a
// platform-relative href such as "/chat/abc" — resolves against the active tab's
// current URL to the full conversation URL, with no per-platform origin table to
// maintain (and an already-absolute id passes through unchanged). We only read
// the active tab's URL and update its location via the existing host permissions
// — never page content (PRIV). Guarded so a non-extension context (tests without
// a chrome shim) is a no-op rather than a throw.

import type { ConversationIndex } from '../../shared/types';

interface TabLike {
  id?: number;
  url?: string;
}
interface TabsApi {
  query?: (q: { active: boolean; lastFocusedWindow: boolean }) => Promise<TabLike[]>;
  update?: (tabId: number, props: { url?: string; active?: boolean }) => Promise<unknown> | void;
}

function tabsApi(): TabsApi | undefined {
  return (globalThis as { chrome?: { tabs?: TabsApi } }).chrome?.tabs;
}

/** Navigate the active tab to `conv`. No-op when there is no resolvable active
 *  tab/URL or the id cannot be turned into a URL (nothing safe to navigate to). */
export async function openConversation(conv: Pick<ConversationIndex, 'nativeId'>): Promise<void> {
  const tabs = tabsApi();
  if (!tabs?.query || !tabs.update) return;
  const [tab] = await tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id || !tab.url) return;
  let target: string;
  try {
    target = new URL(conv.nativeId, tab.url).href;
  } catch {
    return; // nativeId is not URL-resolvable against the active tab — bail
  }
  await tabs.update(tab.id, { url: target, active: true });
}
