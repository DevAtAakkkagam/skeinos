// Content-script logic home — DOM-only (the `side-panel` change, D4). On a
// supported host it picks the platform's config, builds the generic adapter, and
// runs `selfCheck()` (LLD §4.3): on failure it stays dormant, reports its health
// to the worker, and raises an in-product breakage banner so the user knows this
// platform is paused — all isolated to this tab. On success it ingests the host's
// conversation list through the worker. It mounts NO workspace UI: the sidebar
// shell now lives in the browser side panel, not injected into the host page.

import {
  createAdapter,
  getPlatformHealth,
  loadConfig,
  matchPlatform,
  mountBanner,
  reportHealth,
  waitForSelfCheck,
} from '../adapters';
import { mutateWorkspaceRemote } from '../core/folders';

export async function runContent(): Promise<void> {
  const url = location.href;
  const platformId = matchPlatform(url);
  if (!platformId) return; // not a platform we drive

  // A previously-degraded platform carries a hot-fix flag, which nudges the loader
  // to attempt a remote selector refresh on this load (design D-R4).
  const health = await getPlatformHealth(platformId);
  const config = await loadConfig(platformId, { hotfixWanted: health.hotfixWanted });
  if (!config) return; // no bundled config shipped for this platform yet

  const adapter = createAdapter(config);
  // Don't judge the adapter broken on the first synchronous probe: the host SPA
  // hydrates its anchors after `document_idle`, so wait (re-probing on DOM
  // mutations) until the check passes or a bounded timeout elapses. A genuinely
  // stale selector still fails after the timeout and raises the banner below.
  const check = await waitForSelfCheck(adapter);
  await reportHealth(platformId, check);
  if (!check.ok) {
    console.warn('[Skeinos] adapter self-check failed', platformId, check.missing);
    // Surface the breakage to the user (isolated to this tab) instead of staying
    // silent; Retry re-probes and clears the notice once the platform recovers.
    mountBanner(adapter, platformId);
    return;
  }

  // Self-check passed: the adapter is ready. Ingest the host's current
  // conversation list through the worker so folder counts reflect them. The
  // adapter is the only DOM reader; `core/` never touches the page. No workspace
  // UI is mounted here — the side panel owns that surface now.
  console.log('[Skeinos] adapter ready', platformId, adapter.configVersion);

  const refs = adapter
    .listConversations()
    .map((ref) => ({ nativeId: ref.nativeId, title: ref.title }));
  if (refs.length > 0) {
    await mutateWorkspaceRemote({ op: 'conversation.ingest', platform: platformId, refs });
  }

  // Active-conversation seam (conversation-filing): tell the worker which
  // conversation this tab currently has open so the side panel's
  // current-conversation card reflects it. Only id/title cross — never message
  // content (PRIV-1). Report on load and again whenever the host SPA swaps the
  // open conversation without a full reload (the adapter already keys active-by-
  // URL and emits `conversation-changed`).
  const reportActive = (ref: { nativeId: string; title: string } | null): void => {
    if (!ref) return;
    void mutateWorkspaceRemote({
      op: 'conversation.reportActive',
      platform: platformId,
      nativeId: ref.nativeId,
      title: ref.title,
    });
  };
  reportActive(adapter.detectConversation());
  adapter.observe((e) => {
    if (e.type === 'conversation-changed') reportActive(e.ref);
  });
}
