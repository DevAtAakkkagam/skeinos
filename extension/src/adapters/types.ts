// The platform adapter contract (LLD §4.1) and config schema (LLD §4.2). This is
// the ONLY platform-facing surface the rest of the system sees: every platform is
// driven by one generic adapter + a per-platform config, so a new platform is a
// config + fixture — never new code (CLAUDE.md [ADAPT]).

import type { PlatformId } from '../shared/types';

export type { PlatformId };

/** A conversation as the host page exposes it. */
export interface ConversationRef {
  nativeId: string;
  title: string;
  url: string;
}

/** One message read from an open conversation. */
export interface Message {
  role: 'user' | 'assistant';
  text: string;
  order: number;
}

/** Result of probing the live DOM for an adapter's required anchors. */
export interface SelfCheckResult {
  ok: boolean;
  /** Selector keys whose anchors did not resolve. Empty when `ok`. */
  missing: string[];
}

/**
 * How the content script should react after probing the DOM, derived from
 * `selfCheck()` + the optional `authedMarker` + the capability tiers (design D2):
 * - `ready` — all required anchors resolve; mount the full overlay.
 * - `breakage` — anchors are missing while the user is provably signed in (the
 *   `authedMarker` resolves) — a genuine breakage that earns the banner. Also the
 *   legacy default when a config carries no `authedMarker`.
 * - `signed-out-compose` — not signed in, but the COMPOSE tier resolves: mount the
 *   input bar only (no history, no banner).
 * - `signed-out-dormant` — not signed in and no composer: stay quiet (no banner).
 */
export type Readiness = 'ready' | 'breakage' | 'signed-out-compose' | 'signed-out-dormant';

/** Live signals an adapter emits so the overlay tracks host-page changes. */
export type AdapterEvent =
  // `ref` is null when the active tab leaves a conversation (e.g. a "new chat"/home
  // page) — the consumer clears the active-conversation state rather than keeping a
  // stale one.
  | { type: 'conversation-changed'; ref: ConversationRef | null }
  | { type: 'list-changed' }
  // One or more conversations disappeared from the host list AND it was a genuine
  // user delete, not virtualization/scroll-recycling, a sidebar collapse, or a
  // full-list re-render (the adapter guards all three). `nativeIds` are the removed
  // ids so the consumer can prune their records (see `observe`).
  | { type: 'list-removed'; nativeIds: string[] }
  | { type: 'composer-ready' };

/**
 * The single contract the rest of the system programs against. One generic
 * implementation fulfils this for every platform by reading an {@link AdapterConfig}.
 */
export interface PlatformAdapter {
  readonly platformId: PlatformId;
  readonly configVersion: string;
  selfCheck(): SelfCheckResult;
  /** Classify the page after probing the DOM (design D2): drives whether the
   *  content script mounts the full overlay, an input-bar-only overlay, stays
   *  dormant, or raises the breakage banner. Never throws. */
  classify(): Readiness;
  detectConversation(): ConversationRef | null;
  listConversations(): ConversationRef[];
  readMessages(nativeId: string): Promise<Message[]>;
  getInputElement(): HTMLElement | null;
  /** Whether the host composer currently holds no draft (trimmed). */
  isComposerEmpty(): boolean;
  insertText(text: string, opts?: { replace?: boolean }): boolean;
  submit(): boolean;
  mountPoints(): { sidebar: HTMLElement; inputBar: HTMLElement } | null;
  /** The input-bar dock anchor on its own — resolves even when the sidebar anchor
   *  is absent (a signed-out compose-only page), so the input bar can mount there
   *  where `mountPoints()` (which requires both) would return null. */
  inputBarMount(): HTMLElement | null;
  observe(onChange: (e: AdapterEvent) => void): () => void; // returns a disposer
}

/** How the generic adapter commits text into a platform's composer. */
export type InsertMode = 'execCommand' | 'react-set' | 'paste';

/** How the generic adapter sends a composed message. */
export type SubmitMode = 'click' | 'enter';

/** The selector set every platform config must provide (LLD §4.2). */
export interface AdapterSelectors {
  conversationList: string;
  conversationItem: string;
  conversationTitle: string;
  /** Optional attribute on the item (or its title element) that carries the title
   *  text when it is NOT the element's `textContent` — e.g. Perplexity files the id
   *  on an overlay `<a>` whose label sits in its `aria-label`, not its text. Read
   *  after `conversationTitle`'s text and before the item's own text. */
  conversationTitleAttr?: string;
  conversationIdAttr: string;
  /** Optional regex (as a string) that extracts the open conversation's `nativeId`
   *  straight from the page URL — the reliable signal when the host collapses or
   *  virtualizes its list so the open chat has no DOM item to mark. Capture group 1
   *  is used when present, else the whole match. The result must equal the
   *  `conversationIdAttr` value the list items carry, so highlighting matches. */
  conversationUrlPattern?: string;
  messageUser: string;
  messageAssistant: string;
  composer: string;
  sendButton: string;
  sidebarAnchor: string;
  inputBarAnchor: string;
  /** Optional selector matching an element present ONLY when the user is signed in
   *  (e.g. an account/avatar control). When it resolves on a failing `selfCheck()`,
   *  the failure is a genuine breakage (banner); when it does not, the page is
   *  treated as signed-out (no banner) — see {@link Readiness}. MUST be
   *  language-independent: no visible text, `aria-label`, or assumed auth/route
   *  URL (prefer `data-testid`/stable structural attrs). Absent ⇒ never classified
   *  signed-out (legacy behavior). */
  authedMarker?: string;
}

/** Platform write quirks the generic adapter switches on (never on platformId). */
export interface AdapterBehaviors {
  insertMode: InsertMode;
  submitMode: SubmitMode;
  supportsSystemPrompt: boolean;
  // The host renders its conversation list ONLY while its side drawer is expanded
  // (Gemini), so a collapsed drawer leaves `listConversations()` empty even though
  // chats exist. When true, the content script flags this state so the side panel
  // can nudge the user to open the drawer once to sync. Platforms that keep their
  // list in the DOM when collapsed (Claude, Perplexity) omit it. Optional/additive.
  listHiddenWhenCollapsed?: boolean;
  // The host runs a global handler that force-focuses its own composer whenever focus
  // lands elsewhere (Perplexity), so an overlay text field can't hold focus and
  // keystrokes leak into the native box. When true, the input bar's popover contains
  // focus while open (window-capture focusin guard). Hosts that don't steal focus
  // omit it — the guard is invasive (it suppresses host focus events while open), so
  // only the platforms that need it opt in. Optional/additive.
  composerStealsFocus?: boolean;
}

/**
 * A platform configuration. Bundled for offline use and refreshable from a
 * versioned endpoint, so selectors are hot-fixable without a store release. It is
 * pure data — no code is ever loaded remotely (CLAUDE.md [MV3]).
 */
export interface AdapterConfig {
  platformId: PlatformId;
  configVersion: string; // semver, compared against bundled
  hostMatch: string[]; // MV3 URL match patterns
  selectors: AdapterSelectors;
  behaviors: AdapterBehaviors;
}

/** Anchors the input bar needs: a usable composer + its dock. Present on a
 *  signed-out page that still exposes a composer (ChatGPT/Gemini), enabling the
 *  compose-only overlay (design D2). */
export const COMPOSE_ANCHORS = [
  'composer',
  'inputBarAnchor',
] as const satisfies readonly (keyof AdapterSelectors)[];

/** Anchors the workspace features need: the host conversation list + its nav.
 *  Absent on a signed-out page even when COMPOSE resolves. */
export const WORKSPACE_ANCHORS = [
  'conversationList',
  'sidebarAnchor',
] as const satisfies readonly (keyof AdapterSelectors)[];

/** The selector keys that must resolve for the full overlay to mount (LLD §4.3) —
 *  the union of the COMPOSE and WORKSPACE tiers. */
export const REQUIRED_ANCHORS = [
  'composer',
  'conversationList',
  'sidebarAnchor',
  'inputBarAnchor',
] as const satisfies readonly (keyof AdapterSelectors)[];
