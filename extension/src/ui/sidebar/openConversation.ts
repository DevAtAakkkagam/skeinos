// Open a filed conversation, routing by platform relative to the panel's active
// tab (design D4). When the conversation belongs to the active tab's platform we
// navigate the active tab: its `nativeId` — a platform-relative href such as
// "/chat/abc" — resolves against the active tab's current URL (an already-absolute
// id passes through unchanged). When it belongs to a *different* platform we open it
// in a tab: if a tab for that platform's origin is already open we reuse it
// (navigate it to the conversation and focus its window), otherwise we open a new
// tab from the platform-branding origin URL.
//
// We only read tab URLs (to find an existing platform tab) and write a location /
// create a tab / focus a window — never page content (PRIV). To-any-URL
// `tabs.create` / `tabs.query` need no extra permission. Guarded so a
// non-extension context (tests without a chrome shim) is a no-op rather than a throw.

import type { ConversationIndex, PlatformId } from '../../shared/types';
import { platformOrigin, resolveConversationUrl } from '../../shared/branding';

interface TabLike {
  id?: number;
  url?: string;
  windowId?: number;
}
interface TabsApi {
  query?: (q: {
    active?: boolean;
    lastFocusedWindow?: boolean;
    url?: string | string[];
  }) => Promise<TabLike[]>;
  update?: (tabId: number, props: { url?: string; active?: boolean }) => Promise<unknown> | void;
  create?: (props: { url: string }) => Promise<unknown> | void;
}
interface WindowsApi {
  update?: (windowId: number, props: { focused?: boolean }) => Promise<unknown> | void;
}

function chromeApi(): { tabs?: TabsApi; windows?: WindowsApi } | undefined {
  return (globalThis as { chrome?: { tabs?: TabsApi; windows?: WindowsApi } }).chrome;
}

type ConvForOpen = Pick<ConversationIndex, 'platform' | 'nativeId'>;

/** Navigate the active tab to a same-platform conversation. No-op when there is no
 *  resolvable active tab/URL or the id cannot be turned into a URL. */
async function navigateActiveTab(tabs: TabsApi, conv: ConvForOpen): Promise<void> {
  if (!tabs.query || !tabs.update) return;
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

/** Find an already-open tab whose URL is on `origin`, or `null` when none exists or
 *  the query is unavailable / rejects. */
async function findPlatformTab(tabs: TabsApi, origin: string): Promise<TabLike | null> {
  if (!tabs.query) return null;
  try {
    const tabs_ = await tabs.query({ url: `${origin}/*` });
    return tabs_.find((t) => t.id != null) ?? null;
  } catch {
    return null;
  }
}

/**
 * Open `conv` relative to the panel's `activePlatform`.
 * - same platform → navigate the active tab (relative-nativeId path).
 * - different platform → if a tab for that platform is already open, navigate it and
 *   focus its window; otherwise open a new tab from the branding origin URL.
 */
export async function openConversation(conv: ConvForOpen, activePlatform?: PlatformId): Promise<void> {
  const api = chromeApi();
  if (!api?.tabs) return;
  const { tabs, windows } = api;

  if (activePlatform == null || conv.platform === activePlatform) {
    await navigateActiveTab(tabs, conv);
    return;
  }

  const url = resolveConversationUrl(conv.platform, conv.nativeId);
  if (!url) return; // no origin for this platform — nothing safe to open
  const origin = platformOrigin(conv.platform);

  const existing = origin ? await findPlatformTab(tabs, origin) : null;
  if (existing?.id != null && tabs.update) {
    await tabs.update(existing.id, { url, active: true });
    if (existing.windowId != null && windows?.update) {
      await windows.update(existing.windowId, { focused: true });
    }
    return;
  }

  if (tabs.create) await tabs.create({ url });
}
