// The single generic, config-driven adapter (design D-A1). Every method
// is driven by the config's selectors and behaviors — there are NO per-platform
// branches, so adding a platform is a config + fixture, never new code. The DOM
// root is injectable so the contract suite can run it against a recorded fixture.

import {
  type AdapterConfig,
  type AdapterEvent,
  type ConversationRef,
  type HistoryExpansionOptions,
  type HistoryExpansionSummary,
  type Message,
  type PlatformAdapter,
  type Readiness,
  COMPOSE_ANCHORS,
  REQUIRED_ANCHORS,
} from '../types';
import { readComposerText, writeComposer } from './composer-io';
import { findScroller } from './scroller';

/** Sweep tuning defaults, from the live ChatGPT trace (design D2): a page lands
 *  within ~900ms of hitting the end, growth arrives in +2/+26 row pairs so two
 *  quiet rounds mean the end, and ~28 rows per page × 2 rounds per page puts a
 *  1000-conversation account at ~72 rounds ≈ 65s — inside both caps. */
const HISTORY_DEFAULTS = {
  settleMs: 900,
  stableRounds: 2,
  maxRounds: 120,
  maxMs: 90_000,
} as const;

/** A configured/overridden tuning value, or the default when absent or unusable.
 *  Validation already rejects non-positive numbers in a bundled config; this is the
 *  same guard for per-call overrides and for a config that skipped validation. */
function tuning(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Anything we can query + observe — a live `Document` or a fixture container. */
type Root = Document | HTMLElement;

export interface AdapterContext {
  /** DOM root to query (defaults to the page `document`). */
  root?: Root;
  /** Current URL, used to resolve the active conversation (defaults to `location`). */
  getUrl?: () => string;
}

export function createAdapter(config: AdapterConfig, ctx: AdapterContext = {}): PlatformAdapter {
  const { selectors, behaviors } = config;
  const root: Root = ctx.root ?? (globalThis as { document?: Document }).document!;
  const getUrl = ctx.getUrl ?? (() => (globalThis as { location?: Location }).location?.href ?? '');

  const q = <E extends Element = Element>(sel: string): E | null =>
    (root?.querySelector(sel) as E | null) ?? null;
  const qa = <E extends Element = Element>(scope: ParentNode, sel: string): E[] =>
    Array.from(scope.querySelectorAll(sel)) as E[];

  function listScope(): ParentNode {
    return q(selectors.conversationList) ?? root;
  }

  function itemElements(): Element[] {
    return qa(listScope(), selectors.conversationItem);
  }

  // Normalize a raw `conversationIdAttr` value into the canonical `nativeId` via
  // the optional `conversationIdPattern` (capture 1, else whole match). Compiled
  // once; a malformed pattern (bad remote hot-fix) disables normalization rather
  // than throwing, and a non-matching value passes through raw — both fail-open.
  let idRegex: RegExp | null = null;
  if (selectors.conversationIdPattern) {
    try {
      idRegex = new RegExp(selectors.conversationIdPattern);
    } catch {
      idRegex = null;
    }
  }
  function normalizeId(raw: string): string {
    if (!idRegex) return raw;
    const m = raw.match(idRegex);
    return m ? (m[1] ?? m[0]) : raw;
  }

  function itemId(item: Element): string {
    const raw = item.getAttribute(selectors.conversationIdAttr);
    return raw ? normalizeId(raw) : '';
  }

  // Host icon fonts (Claude's "Anthropicons") embed their glyphs as REAL text —
  // private-use-area characters inside the title element — so a raw `textContent`
  // title carries an invisible PUA char that renders as a tofu box in our UI and
  // pollutes the search index. Strip PUA (all three planes) and zero-width/BOM
  // characters, then collapse the whitespace that stripping leaves behind.
  function cleanTitle(raw: string): string {
    return raw
      .replace(/[\u{E000}-\u{F8FF}\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}\u{FEFF}\u{200B}-\u{200D}]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function refFromItem(item: Element): ConversationRef {
    const nativeId = itemId(item);
    const titleEl = item.querySelector(selectors.conversationTitle);
    // Prefer the title element's text; then a configured title attribute (for hosts
    // that label an item via an attribute rather than text); then the item's text.
    const titleAttr = selectors.conversationTitleAttr;
    const title = cleanTitle(
      titleEl?.textContent ??
        (titleAttr ? item.getAttribute(titleAttr) : null) ??
        item.textContent ??
        '',
    );
    const url =
      item.getAttribute('href') ?? item.querySelector('a')?.getAttribute('href') ?? '';
    return { nativeId, title, url };
  }

  function activeItem(): Element | null {
    const items = itemElements();
    // Prefer the explicit active marker (the accessible convention chat apps use);
    // otherwise fall back to the item whose id appears in the current URL.
    const marked = items.find((el) => el.matches('[aria-current], [data-active="true"]'));
    if (marked) return marked;
    const url = getUrl();
    return (
      items.find((el) => {
        const id = itemId(el);
        return !!id && url.includes(id);
      }) ?? null
    );
  }

  // On a platform that drops its conversation list from the DOM while its side
  // drawer is collapsed (Gemini — `listHiddenWhenCollapsed`), an absent
  // `conversationList` is the EXPECTED collapsed state, not a breakage: the list
  // anchor reappears the moment the user opens the drawer. Requiring it here would
  // classify a signed-in collapsed page as `breakage` and raise the on-page banner,
  // when the intended reaction is to activate and let the side panel show the
  // collapsed-list nudge. So we relax just that one anchor for such platforms; the
  // composer/sidebar/input-bar anchors stay required (they persist when collapsed).
  function requiredAnchors(): readonly (typeof REQUIRED_ANCHORS)[number][] {
    if (!behaviors.listHiddenWhenCollapsed) return REQUIRED_ANCHORS;
    return REQUIRED_ANCHORS.filter((key) => key !== 'conversationList');
  }

  function selfCheck() {
    const missing = requiredAnchors().filter((key) => !q(selectors[key]));
    return { ok: missing.length === 0, missing: [...missing] };
  }

  /** Whether the config carries an `authedMarker` AND it resolves in the document —
   *  i.e. the host app shell is rendered for a signed-in user. A config without an
   *  `authedMarker` can never be proven signed-in here (see `classify`). */
  function signedInDetected(): boolean {
    const sel = selectors.authedMarker;
    return !!sel && !!q(sel);
  }

  /** Whether the config carries a `signedOutMarker` AND it resolves — a positive,
   *  unambiguous "not signed in" signal (a login / sign-up control). It OUTRANKS
   *  `authedMarker` so a host that renders an account/profile control on its
   *  logged-out shell (ChatGPT) is never mistaken for a broken signed-in page. */
  function signedOutDetected(): boolean {
    const sel = selectors.signedOutMarker;
    return !!sel && !!q(sel);
  }

  /** Classify the page after a DOM probe (design D2). Fail-quiet: a `breakage` (the
   *  banner) is reserved for a page we cannot prove is signed-out. A visible sign-in
   *  control proves signed-out outright; otherwise we fall back to the authed-marker
   *  heuristic, and a config with no markers keeps the legacy "failing check ⇒
   *  breakage" behavior. */
  function classify(): Readiness {
    if (selfCheck().ok) return 'ready';
    const provablySignedOut =
      signedOutDetected() || (!!selectors.authedMarker && !signedInDetected());
    if (!provablySignedOut) return 'breakage';
    const composeOk = COMPOSE_ANCHORS.every((key) => !!q(selectors[key]));
    return composeOk ? 'signed-out-compose' : 'signed-out-dormant';
  }

  // A human title for the open conversation when no list item supplies one — the
  // host has collapsed or virtualized its conversation list (Gemini renders the
  // list only while its side drawer is open), so `refFromUrl` has the id but no
  // list title. These chat apps auto-title a conversation from its opening user
  // turn, so the first rendered user message is the natural, content-free fallback
  // — far better than the empty title that otherwise surfaces in Unfiled. Capped so
  // a long first message doesn't become an unwieldy title. PRIV-1 holds: this id +
  // short title behaves exactly like a list ref and is corrected to the real list
  // title the moment the list renders (the title-index path is read-modify-write).
  function firstUserTitle(): string {
    const el = q(selectors.messageUser);
    const text = cleanTitle(el?.textContent ?? '');
    return text.length > 80 ? `${text.slice(0, 79)}…` : text;
  }

  // Derive the open conversation's id straight from the URL via the config's
  // `conversationUrlPattern`. This is the reliable signal when the host hides,
  // collapses, or virtualizes its list so the open chat has no DOM item for
  // `activeItem()` to find (otherwise detection returns null and the side panel
  // highlights a stale conversation). Title comes from a matching list item when
  // one is present, else from the open chat's first user turn (`firstUserTitle`).
  function refFromUrl(): ConversationRef | null {
    const pattern = selectors.conversationUrlPattern;
    if (!pattern) return null;
    const url = getUrl();
    let m: RegExpMatchArray | null = null;
    try {
      m = url.match(new RegExp(pattern));
    } catch {
      return null; // a malformed pattern disables URL detection rather than throwing
    }
    if (!m) return null;
    const nativeId = m[1] ?? m[0];
    const item = itemElements().find((el) => itemId(el) === nativeId);
    return { nativeId, title: item ? refFromItem(item).title : firstUserTitle(), url };
  }

  function detectConversation(): ConversationRef | null {
    const item = activeItem();
    if (item) return refFromItem(item);
    return refFromUrl();
  }

  function listConversations(): ConversationRef[] {
    return itemElements().map(refFromItem);
  }

  // History-expansion sweep (chatgpt-history-backfill). Hosts that paginate their
  // sidebar only render the page they have fetched, so `listConversations()` sees a
  // fraction of the user's history (ChatGPT: 55 of 137, measured live). Drive the
  // host's own scroller to the end until the list stops growing, then hand back the
  // (now complete) DOM for a normal `listConversations()` read.
  //
  // Best-effort by contract: it never throws and always restores the user's scroll
  // position, so a host that changed shape costs an incomplete backfill, never a
  // broken tab.
  const noopSummary = (): HistoryExpansionSummary => ({
    startCount: 0,
    finalCount: 0,
    distinctSeen: 0,
    rounds: 0,
    stoppedBy: 'noop',
  });

  async function expandHistory(
    opts: HistoryExpansionOptions = {},
  ): Promise<HistoryExpansionSummary> {
    const expansion = behaviors.historyExpansion;
    // No declared expansion ⇒ resolve without touching the DOM at all.
    if (!expansion || expansion.mode !== 'scroll') return noopSummary();

    const settleMs = tuning(opts.settleMs ?? expansion.settleMs, HISTORY_DEFAULTS.settleMs);
    const stableRounds = tuning(
      opts.stableRounds ?? expansion.stableRounds,
      HISTORY_DEFAULTS.stableRounds,
    );
    const maxRounds = tuning(opts.maxRounds ?? expansion.maxRounds, HISTORY_DEFAULTS.maxRounds);
    const maxMs = tuning(opts.maxMs ?? expansion.maxMs, HISTORY_DEFAULTS.maxMs);

    let scroller: Element | null = null;
    let originalScrollTop = 0;
    try {
      scroller = findScroller(q(selectors.conversationList));
      if (!scroller) return noopSummary(); // nothing paginates here
      originalScrollTop = scroller.scrollTop;

      // Every id ever rendered, across every round. Equal to the final row count on
      // an append-only host; larger under windowed virtualization — the signal a
      // later change can act on rather than trusting the append-only assumption.
      const seen = new Set<string>();
      const measure = (): number => {
        const items = itemElements();
        for (const item of items) {
          const id = itemId(item);
          if (id) seen.add(id);
        }
        return items.length;
      };

      const startCount = measure();
      let count = startCount;
      let height = scroller.scrollHeight;
      let rounds = 0;
      let stable = 0;
      // Assume a cap until a plateau proves otherwise, so every early exit below
      // (round cap, wall clock) reports the partial outcome honestly.
      let stoppedBy: HistoryExpansionSummary['stoppedBy'] = 'cap';
      const deadline = Date.now() + maxMs;

      while (rounds < maxRounds && Date.now() < deadline) {
        scroller.scrollTop = scroller.scrollHeight;
        await delay(settleMs);
        rounds++;
        const nextCount = measure();
        const nextHeight = scroller.scrollHeight;
        // Growth in EITHER signal keeps the sweep going: the host renders short
        // placeholder rounds (+2 rows) before each real page (+26), and a host that
        // renders fixed-height skeletons would grow the count without the height.
        // Requiring both to go quiet is what stops an early exit mid-history.
        const grew = nextCount > count || nextHeight > height;
        count = nextCount;
        height = nextHeight;
        stable = grew ? 0 : stable + 1;
        if (stable >= stableRounds) {
          stoppedBy = 'plateau';
          break;
        }
      }

      return { startCount, finalCount: count, distinctSeen: seen.size, rounds, stoppedBy };
    } catch (err) {
      console.warn('[Skeinos] history expansion failed', config.platformId, err);
      return noopSummary();
    } finally {
      // Restore on EVERY exit path — plateau, cap, and error alike. The user's
      // sidebar is left where they had it (design D6).
      if (scroller) {
        try {
          scroller.scrollTop = originalScrollTop;
        } catch {
          // A detached/replaced scroller can't be restored — nothing else to do.
        }
      }
    }
  }

  async function readMessages(_nativeId: string): Promise<Message[]> {
    const combined = `${selectors.messageUser}, ${selectors.messageAssistant}`;
    return qa(root, combined).map((el, order) => ({
      role: el.matches(selectors.messageUser) ? 'user' : 'assistant',
      text: (el.textContent ?? '').trim(),
      order,
    }));
  }

  function getInputElement(): HTMLElement | null {
    return q<HTMLElement>(selectors.composer);
  }

  // Whether the host composer currently holds no draft — read from the same node
  // `insertText` writes (form field `value` or contenteditable `textContent`). Drives
  // the input bar's "prepend the active profile only into an empty composer" rule, so
  // a standing instruction never clobbers or duplicates over text the user is typing.
  // A missing composer reads as empty (nothing to preserve).
  function isComposerEmpty(): boolean {
    const el = getInputElement();
    if (!el) return true;
    return readComposerText(el).trim().length === 0;
  }

  function insertText(text: string, opts?: { replace?: boolean }): boolean {
    const el = getInputElement();
    if (!el) return false;
    return writeComposer(el, text, {
      replace: opts?.replace ?? false,
      preferExecCommand: behaviors.insertMode === 'execCommand',
    });
  }

  function submit(): boolean {
    if (behaviors.submitMode === 'enter') {
      const el = getInputElement();
      if (!el) return false;
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      return true;
    }
    const btn = q<HTMLElement>(selectors.sendButton);
    if (!btn) return false;
    btn.click();
    return true;
  }

  function mountPoints() {
    const sidebar = q<HTMLElement>(selectors.sidebarAnchor);
    const inputBar = q<HTMLElement>(selectors.inputBarAnchor);
    return sidebar && inputBar ? { sidebar, inputBar } : null;
  }

  /** The input-bar dock on its own — used by the compose-only overlay where the
   *  sidebar anchor is absent and `mountPoints()` would therefore return null. */
  function inputBarMount(): HTMLElement | null {
    return q<HTMLElement>(selectors.inputBarAnchor);
  }

  // Removal-detection guards (design: DOM row-removal observer). A row vanishing
  // from the host list is only treated as a real delete when ALL hold: the list is
  // still present (not collapsed/torn down), the burst is small (a user deletes one
  // at a time — a mass disappearance is a re-render), and no scroll happened just
  // before (a scroll that recycles virtualized rows is not a delete). Together these
  // make a false prune — which would lose the user's folder/tags — very unlikely.
  const idsOf = (els: Element[]): Set<string> => {
    const ids = new Set<string>();
    for (const el of els) {
      const id = itemId(el);
      if (id) ids.add(id);
    }
    return ids;
  };

  function observe(onChange: (e: AdapterEvent) => void): () => void {
    let disposed = false;
    const emit = (e: AdapterEvent) => {
      if (!disposed) onChange(e);
    };

    let lastActive = detectConversation()?.nativeId ?? null;
    let lastIds = idsOf(itemElements());
    let lastCount = lastIds.size;
    // A scroll within this window before a removal marks it as virtualization
    // recycling rather than a delete. `Date.now()` is fine here — this is the
    // content-script/DOM path, not a workflow script.
    const SCROLL_GRACE_MS = 700;
    // A user deletes conversations one at a time; more than this vanishing at once
    // is a full-list re-render, never a delete burst.
    const REMOVE_BURST_CAP = 3;
    let lastScrollAt = 0;
    const onScroll = (): void => {
      lastScrollAt = Date.now();
    };
    // Track the composer element by identity so an SPA navigation that REPLACES
    // the composer subtree re-emits `composer-ready`, letting an overlay anchored
    // to the composer (the input bar) dispose its orphaned mount and re-anchor
    // into the fresh node. An in-place re-render keeps the same node, so no event
    // fires and the existing mount stays valid (design D-3).
    let lastComposer = getInputElement();

    const target: EventTarget & Node =
      root instanceof Document ? (root.documentElement ?? root) : root;
    // Capture phase: scroll does not bubble, but the host's scroller is a descendant
    // of `target`, so capturing here sees its scroll. Passive: we never preventDefault.
    target.addEventListener('scroll', onScroll, { capture: true, passive: true });
    const mo = new MutationObserver(() => {
      const items = itemElements();
      const ids = idsOf(items);
      const count = items.length;
      if (count !== lastCount) {
        lastCount = count;
        emit({ type: 'list-changed' });
      }
      // Detect genuine deletes: ids present last tick, gone now. Guarded so
      // virtualization, a collapsed/torn-down list, and full re-renders never prune
      // (see the guards' rationale above). Update `lastIds` every tick regardless, so
      // a skipped (guarded-out) disappearance is not re-reported next tick.
      const removed: string[] = [];
      for (const id of lastIds) if (!ids.has(id)) removed.push(id);
      lastIds = ids;
      if (
        removed.length > 0 &&
        ids.size > 0 &&
        removed.length <= REMOVE_BURST_CAP &&
        Date.now() - lastScrollAt >= SCROLL_GRACE_MS
      ) {
        emit({ type: 'list-removed', nativeIds: removed });
      }
      const ref = detectConversation();
      const active = ref?.nativeId ?? null;
      if (active !== lastActive) {
        lastActive = active;
        // Emit on every transition — including to `null` (the user left a
        // conversation for a new-chat/home page) so the consumer clears its
        // active-conversation state instead of keeping a stale highlight.
        emit({ type: 'conversation-changed', ref });
      }
      const composer = getInputElement();
      if (composer !== lastComposer) {
        lastComposer = composer;
        // Re-emit only when a real composer is present (a transient absence
        // mid-swap simply waits for the replacement to arrive).
        if (composer) emit({ type: 'composer-ready' });
      }
    });
    mo.observe(target, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-current', 'data-active'],
    });

    if (lastComposer) queueMicrotask(() => emit({ type: 'composer-ready' }));

    return () => {
      disposed = true;
      mo.disconnect();
      target.removeEventListener('scroll', onScroll, { capture: true });
    };
  }

  return {
    platformId: config.platformId,
    configVersion: config.configVersion,
    selfCheck,
    classify,
    detectConversation,
    listConversations,
    expandHistory,
    readMessages,
    getInputElement,
    isComposerEmpty,
    insertText,
    submit,
    mountPoints,
    inputBarMount,
    observe,
  };
}
