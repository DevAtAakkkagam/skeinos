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
// Import from the leaf client (not the feature barrel) so the tight content-script
// bundle never risks pulling the worker-only engine/handlers + IndexedDB code.
import { indexConversationFromMessagesRemote } from '../core/conversation-index/client';
// Leaf import (not the messaging barrel) so the content bundle never pulls the
// worker-only hub/registry — same reason as the conversation-index client above.
import { isContextValid, runtime } from '../core/messaging/chrome';
import { conversationId } from '../shared/workspace';
import { OPEN_SIDE_PANEL } from '../shared/sidepanel';
import { mountInputBar } from '../ui/input-bar/mountInputBar';
import type { MountHandle } from '../ui/mount';

// SPA hosts mutate the chat list in bursts (lazy render, infinite scroll, nav).
// Collapse those into a single ingest so we don't spam the worker per-mutation.
const INGEST_DEBOUNCE_MS = 500;

export async function runContent(): Promise<void> {
  // Re-entrancy guard: the content script auto-injects on page load, but the worker
  // ALSO injects it into already-open tabs on install/update (background/injectOpenTabs).
  // Those never overlap in a single live context — but if they ever did, running twice
  // would double-wire the adapter observers. One flag on the page global makes a
  // second run in the same context a no-op.
  const g = globalThis as { __skeinosContentStarted?: boolean };
  if (g.__skeinosContentStarted) return;
  g.__skeinosContentStarted = true;

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
  // conversation list through the worker so folder counts and the unfiled section
  // reflect them. The adapter is the only DOM reader; `core/` never touches the
  // page. No workspace UI is mounted here — the side panel owns that surface now.
  console.log('[Skeinos] adapter ready', platformId, adapter.configVersion);

  // Ingestion must be RESILIENT on SPA hosts (Claude/Gemini): the chat list is
  // often not yet rendered at the instant self-check passes, and the user moves
  // between chats without a full reload — so a one-shot ingest on load silently
  // misses everything (the old bug). We instead ingest on load AND re-ingest
  // (debounced) whenever the adapter reports the list changed or the tab regains
  // focus. The worker's `conversation.ingest` is title-keyed/idempotent, so
  // re-firing is cheap and safe.
  // Lifecycle state, wired further down. `teardown` disconnects everything so the
  // script goes fully dormant; every host-driven callback checks `isContextValid()`
  // first and tears down once the extension is uninstalled/reloaded (see below).
  const doc = (globalThis as { document?: Document }).document;
  let ingestTimer: ReturnType<typeof setTimeout> | undefined;
  let torndown = false;
  // Collapsed-list nudge state. On a platform that hides its conversation list when
  // its side drawer is collapsed (Gemini — `listHiddenWhenCollapsed`), an empty
  // `listConversations()` while a chat is open means "drawer collapsed", not "no
  // chats". We flag that on the active record so the side panel can nudge the user
  // to open the drawer once and sync the full list. `lastActiveRef` lets us re-assert
  // the open conversation when the empty↔non-empty state flips, so the nudge
  // appears/clears immediately instead of waiting for the next navigation.
  const listHidesWhenCollapsed = config.behaviors?.listHiddenWhenCollapsed === true;
  let listEmpty = false;
  let lastActiveRef: { nativeId: string; title: string } | null = null;
  // Disposers, populated once the observers below are wired. Held on a `const`
  // holder so `teardown` (defined before them, but referenced from inside the
  // observer callback) can read them without a forward `let` reference.
  const handles: {
    disposeObserver?: () => void;
    onVisibility?: () => void;
    inputBar?: MountHandle;
  } = {};

  // The input action bar (input-bar, design D-2): a shadow-DOM overlay docked at the
  // adapter's `inputBar` anchor. Insertion is append-only and never auto-submits
  // (design D-5) — `insertText` defaults to append, and we never call `submit()`.
  // `(re)mountInputBar` is idempotent: it disposes any prior mount first, so it can
  // run on the initial ready branch AND on every `composer-ready` re-anchor signal,
  // and tolerates a transiently-null `mountPoints()` (no anchor yet) by no-opping
  // until the next signal — mirroring the ingest loop's tolerance of an unhydrated DOM.
  const remountInputBar = (): void => {
    if (!isContextValid()) return void teardown();
    handles.inputBar?.dispose();
    handles.inputBar = undefined;
    const points = adapter.mountPoints();
    if (!points) return;
    handles.inputBar = mountInputBar(points.inputBar, {
      platform: platformId,
      onInsert: (text) => adapter.insertText(text),
      // Wipe the host composer entirely (replace-with-empty, never submits) — the
      // bar's icon-only clear button to the left of the trigger.
      onClear: () => adapter.insertText('', { replace: true }),
      // The Skeinos brand mark opens the workspace side panel. Sent straight from the
      // click handler so Chrome forwards the user gesture to the worker, which calls
      // `chrome.sidePanel.open()` (only the worker can — see background/sidePanel.ts).
      onOpenSidebar: () => void runtime()?.sendMessage({ type: OPEN_SIDE_PANEL }),
      // Lets the bar prepend an active profile only into an empty composer (so the
      // standing instruction rides the next prompt insert without clobbering a draft).
      isComposerEmpty: () => adapter.isComposerEmpty(),
      // Opt into focus containment only for hosts that force-focus their own composer
      // (Perplexity) — the guard is invasive, so it's config-gated, not universal.
      containFocus: config.behaviors?.composerStealsFocus === true,
    });
  };

  // Chrome leaves an already-injected content script (and its observers) running
  // after the extension is uninstalled/reloaded, but invalidates the context, so
  // every worker round-trip now fails. Without this the orphaned script keeps
  // logging "ingesting N conversations" and firing doomed sends on each host
  // mutation until the tab is reloaded. Detect the dead context and go silent.
  const teardown = (): void => {
    if (torndown) return;
    torndown = true;
    if (ingestTimer !== undefined) clearTimeout(ingestTimer);
    ingestTimer = undefined;
    handles.disposeObserver?.();
    if (handles.onVisibility) doc?.removeEventListener('visibilitychange', handles.onVisibility);
    // Dispose the bar (and any open popover/modal it owns) on context invalidation.
    handles.inputBar?.dispose();
    handles.inputBar = undefined;
  };

  const ingestList = (): void => {
    if (!isContextValid()) return void teardown();
    const refs = adapter
      .listConversations()
      .map((ref) => ({ nativeId: ref.nativeId, title: ref.title }));
    const wasEmpty = listEmpty;
    listEmpty = refs.length === 0;
    // The drawer just opened or closed: re-assert the open conversation so its
    // collapsed-list hint (and thus the panel's nudge) updates now. Guarded on
    // `lastActiveRef`, which is null until `reportActive` first runs — so the very
    // first `ingestList()` (before `reportActive` is defined) never reaches it.
    if (listEmpty !== wasEmpty && lastActiveRef) reportActive(lastActiveRef);
    if (refs.length === 0) {
      // Not an error: the SPA list may simply not have hydrated yet. Stay
      // subscribed — the `list-changed` observer below re-fires this once items
      // render, so an empty first probe no longer loses the conversations. Logged
      // at warn (not debug) so a PERSISTENTLY empty list — the signature of a stale
      // list selector — is visible without enabling Verbose logging.
      console.warn('[Skeinos] listConversations() returned 0 items', platformId);
      return;
    }
    console.log('[Skeinos] ingesting', refs.length, 'conversations', platformId);
    void mutateWorkspaceRemote({ op: 'conversation.ingest', platform: platformId, refs }).then(
      (res) => {
        if (!res?.ok) console.warn('[Skeinos] ingest mutation failed', platformId, res);
      },
    );
  };

  const scheduleIngest = (): void => {
    if (!isContextValid()) return void teardown();
    if (ingestTimer !== undefined) clearTimeout(ingestTimer);
    ingestTimer = setTimeout(() => {
      ingestTimer = undefined;
      ingestList();
    }, INGEST_DEBOUNCE_MS);
  };

  ingestList();

  // Active-conversation seam (conversation-filing): tell the worker which
  // conversation this tab currently has open so the side panel's
  // current-conversation card reflects it. Only id/title cross — never message
  // content (PRIV-1). Report on load and again whenever the host SPA swaps the
  // open conversation without a full reload (the adapter already keys active-by-
  // URL and emits `conversation-changed`). A null ref means this tab is NOT on a
  // conversation (a new-chat/home page) — clear the platform's active record so the
  // panel stops highlighting a stale chat rather than leaving the last one pinned.
  const reportActive = (ref: { nativeId: string; title: string } | null): void => {
    lastActiveRef = ref;
    if (!ref) {
      void mutateWorkspaceRemote({ op: 'conversation.clearActive', platform: platformId });
      return;
    }
    void mutateWorkspaceRemote({
      op: 'conversation.reportActive',
      platform: platformId,
      nativeId: ref.nativeId,
      title: ref.title,
      // Only platforms that drop their list when collapsed raise the nudge; the
      // rest always send `false`, so the panel never nudges Claude/Perplexity.
      listCollapsedHint: listHidesWhenCollapsed && listEmpty,
    });
  };

  // Index the open conversation's content for search (C8). The adapter is the only
  // DOM reader; it returns `Message[]`, which we ship to the worker (the single
  // writer) to normalize + index. The worker is content-hash idempotent, so
  // re-indexing an unchanged conversation on every navigation costs one hash and
  // writes nothing. PRIV-1: message content stays on-device — it is indexed into
  // local-only stores and never enters the sync envelope. Best-effort: a failed
  // read/index never disrupts the tab.
  const indexActive = async (ref: { nativeId: string; title: string } | null): Promise<void> => {
    if (!ref) return;
    try {
      const messages = await adapter.readMessages(ref.nativeId);
      if (messages.length === 0) return;
      await indexConversationFromMessagesRemote({
        id: conversationId(platformId, ref.nativeId),
        platform: platformId,
        nativeId: ref.nativeId,
        title: ref.title,
        messages,
      });
    } catch (err) {
      console.warn('[Skeinos] conversation index failed', platformId, err);
    }
  };

  const onActive = (ref: { nativeId: string; title: string } | null): void => {
    if (!isContextValid()) return void teardown();
    reportActive(ref);
    void indexActive(ref);
  };
  onActive(adapter.detectConversation());
  // Dock the input bar now that the adapter is ready (design D-2). If the composer
  // anchor is not hydrated yet, this no-ops; the `composer-ready` signal below mounts
  // it once the composer arrives.
  remountInputBar();
  handles.disposeObserver = adapter.observe((e) => {
    if (!isContextValid()) return void teardown();
    if (e.type === 'conversation-changed') onActive(e.ref);
    // The host added/removed chats in its list (new chat, lazy render, infinite
    // scroll): re-ingest so the unfiled section and folder counts catch up
    // without a page reload. Debounced to collapse mutation bursts.
    else if (e.type === 'list-changed') scheduleIngest();
    // The composer first appeared, or an SPA navigation replaced it (adapter
    // re-emits on element-identity change, design D-3): (re-)anchor the bar into
    // the fresh `inputBar` mount point so it never orphans. Idempotent.
    else if (e.type === 'composer-ready') remountInputBar();
  });

  // Two tabs of one platform share a single per-platform "active" record, so when
  // this tab is re-focused it must re-assert its open conversation — otherwise the
  // side panel keeps highlighting whichever same-platform tab reported last. The
  // worker dedupes a no-op report, so re-asserting the unchanged conversation costs
  // no broadcast. (PRIV-1: still id/title only, never content.)
  handles.onVisibility = (): void => {
    if (!isContextValid()) return void teardown();
    if (doc?.visibilityState !== 'visible') return;
    reportActive(adapter.detectConversation());
    // The user was away on another tab where they may have started/renamed chats;
    // re-ingest on return so this platform's list is current. (Idempotent + debounced.)
    scheduleIngest();
  };
  doc?.addEventListener('visibilitychange', handles.onVisibility);
}
