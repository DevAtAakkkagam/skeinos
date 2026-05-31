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
    const title = (titleEl?.textContent ?? item.textContent ?? '').trim();
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

  function detectConversation(): ConversationRef | null {
    const item = activeItem();
    return item ? refFromItem(item) : null;
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

    if (behaviors.insertMode === 'execCommand') {
      el.focus?.();
      if (replace) writeComposer(el, '', true);
      const exec = (doc as Document & { execCommand?: (c: string, ui: boolean, v: string) => boolean })
        .execCommand;
      if (typeof exec === 'function' && exec.call(doc, 'insertText', false, text)) return true;
      return writeComposer(el, text, replace); // graceful fallback
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
        if (ref) emit({ type: 'conversation-changed', ref });
      }
    });
    mo.observe(target, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-current', 'data-active'],
    });

    if (getInputElement()) queueMicrotask(() => emit({ type: 'composer-ready' }));

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
