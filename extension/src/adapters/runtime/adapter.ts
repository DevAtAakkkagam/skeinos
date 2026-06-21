// The single generic, config-driven adapter (LLD §4.1, design D-A1). Every method
// is driven by the config's selectors and behaviors — there are NO per-platform
// branches, so adding a platform is a config + fixture, never new code. The DOM
// root is injectable so the contract suite can run it against a recorded fixture.

import {
  type AdapterConfig,
  type AdapterEvent,
  type ConversationRef,
  type Message,
  type PlatformAdapter,
  REQUIRED_ANCHORS,
} from '../types';

/** Anything we can query + observe — a live `Document` or a fixture container. */
type Root = Document | HTMLElement;

export interface AdapterContext {
  /** DOM root to query (defaults to the page `document`). */
  root?: Root;
  /** Current URL, used to resolve the active conversation (defaults to `location`). */
  getUrl?: () => string;
}

function nativeValueSetter(el: HTMLElement): ((v: string) => void) | null {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : el instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : null;
  if (!proto) return null;
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  return desc?.set ? (v: string) => desc.set!.call(el, v) : null;
}

/** A form field has a settable native `value`; everything else (ProseMirror, Quill,
 *  Lexical contenteditables) is a rich editor we must drive through the selection. */
function isFormField(el: HTMLElement): el is HTMLTextAreaElement | HTMLInputElement {
  return el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement;
}

/** Collapse the selection to the end of a contenteditable so an appended insert
 *  lands after any existing draft (and an `execCommand` insert targets the editor).
 *  Best-effort: a host without a Selection API simply skips this. */
function caretToEnd(el: HTMLElement, doc: Document): void {
  try {
    const sel = doc.getSelection?.();
    if (!sel) return;
    const range = doc.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch {
    /* no Selection API (e.g. some test envs) — the insert still runs */
  }
}

/** Commit text into a composer, handling both form fields and contenteditable. */
function writeComposer(el: HTMLElement, text: string, replace: boolean): boolean {
  const setNative = nativeValueSetter(el);
  if (setNative) {
    const current = (el as HTMLTextAreaElement | HTMLInputElement).value;
    setNative(replace ? text : current + text);
  } else {
    const current = el.textContent ?? '';
    el.textContent = replace ? text : current + text;
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
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

  function refFromItem(item: Element): ConversationRef {
    const nativeId = item.getAttribute(selectors.conversationIdAttr) ?? '';
    const titleEl = item.querySelector(selectors.conversationTitle);
    // Prefer the title element's text; then a configured title attribute (for hosts
    // that label an item via an attribute rather than text); then the item's text.
    const titleAttr = selectors.conversationTitleAttr;
    const title = (
      titleEl?.textContent ??
      (titleAttr ? item.getAttribute(titleAttr) : null) ??
      item.textContent ??
      ''
    ).trim();
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
        const id = el.getAttribute(selectors.conversationIdAttr);
        return !!id && url.includes(id);
      }) ?? null
    );
  }

  function selfCheck() {
    const missing = REQUIRED_ANCHORS.filter((key) => !q(selectors[key]));
    return { ok: missing.length === 0, missing: [...missing] };
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
    const text = (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
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
    const item = itemElements().find(
      (el) => el.getAttribute(selectors.conversationIdAttr) === nativeId,
    );
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

  function insertText(text: string, opts?: { replace?: boolean }): boolean {
    const el = getInputElement();
    if (!el) return false;
    const replace = opts?.replace ?? false;
    const doc = el.ownerDocument;

    // The insert is triggered from our overlay, so the host editor is NOT focused —
    // focus it first or the write/execCommand has no target. (No-op if already focused.)
    el.focus?.();

    // A rich contenteditable (Claude=ProseMirror, Gemini=Quill, …) manages its own
    // document model and silently reverts a raw `textContent` write, so it must be
    // driven through `execCommand('insertText')`, which dispatches the real
    // `beforeinput`/`input` the editor listens for. We take this path for ANY
    // contenteditable (not just configs tagged `execCommand`) so a host whose
    // textarea became a contenteditable still gets text. Form fields keep the native
    // value-setter path (`react-set`).
    const useExecCommand = behaviors.insertMode === 'execCommand' || !isFormField(el);
    if (useExecCommand) {
      if (replace) writeComposer(el, '', true);
      else caretToEnd(el, doc); // append after the existing draft
      const exec = (doc as Document & { execCommand?: (c: string, ui: boolean, v: string) => boolean })
        .execCommand;
      if (typeof exec === 'function' && exec.call(doc, 'insertText', false, text)) return true;
      return writeComposer(el, text, replace); // graceful fallback (e.g. test envs)
    }

    // 'react-set' and 'paste' both resolve to a native-value write + input event;
    // 'paste' is best-effort and degrades to the same path under test/jsdom.
    return writeComposer(el, text, replace);
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

  function observe(onChange: (e: AdapterEvent) => void): () => void {
    let disposed = false;
    const emit = (e: AdapterEvent) => {
      if (!disposed) onChange(e);
    };

    let lastActive = detectConversation()?.nativeId ?? null;
    let lastCount = itemElements().length;
    // Track the composer element by identity so an SPA navigation that REPLACES
    // the composer subtree re-emits `composer-ready`, letting an overlay anchored
    // to the composer (the input bar) dispose its orphaned mount and re-anchor
    // into the fresh node. An in-place re-render keeps the same node, so no event
    // fires and the existing mount stays valid (design D-3).
    let lastComposer = getInputElement();

    const target: Node = root instanceof Document ? (root.documentElement ?? root) : root;
    const mo = new MutationObserver(() => {
      const count = itemElements().length;
      if (count !== lastCount) {
        lastCount = count;
        emit({ type: 'list-changed' });
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
    };
  }

  return {
    platformId: config.platformId,
    configVersion: config.configVersion,
    selfCheck,
    detectConversation,
    listConversations,
    readMessages,
    getInputElement,
    insertText,
    submit,
    mountPoints,
    observe,
  };
}
