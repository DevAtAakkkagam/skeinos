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

/** Live signals an adapter emits so the overlay tracks host-page changes. */
export type AdapterEvent =
  // `ref` is null when the active tab leaves a conversation (e.g. a "new chat"/home
  // page) — the consumer clears the active-conversation state rather than keeping a
  // stale one.
  | { type: 'conversation-changed'; ref: ConversationRef | null }
  | { type: 'list-changed' }
  | { type: 'composer-ready' };

/**
 * The single contract the rest of the system programs against. One generic
 * implementation fulfils this for every platform by reading an {@link AdapterConfig}.
 */
export interface PlatformAdapter {
  readonly platformId: PlatformId;
  readonly configVersion: string;
  selfCheck(): SelfCheckResult;
  detectConversation(): ConversationRef | null;
  listConversations(): ConversationRef[];
  readMessages(nativeId: string): Promise<Message[]>;
  getInputElement(): HTMLElement | null;
  insertText(text: string, opts?: { replace?: boolean }): boolean;
  submit(): boolean;
  mountPoints(): { sidebar: HTMLElement; inputBar: HTMLElement } | null;
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

/** The selector keys that must resolve for an overlay to mount (LLD §4.3). */
export const REQUIRED_ANCHORS = [
  'composer',
  'conversationList',
  'sidebarAnchor',
  'inputBarAnchor',
] as const satisfies readonly (keyof AdapterSelectors)[];
