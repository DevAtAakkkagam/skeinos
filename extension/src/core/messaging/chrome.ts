// Minimal structural views of the `chrome` APIs the messaging layer uses,
// reached via `globalThis` (the same pattern as core/store/envelope.ts). Keeping
// the surface tiny and structural means the transport works under test with a
// fake `chrome` and never depends on ambient extension globals.

/** A `chrome.runtime.onMessage` listener; return `true` to respond async. */
export type MessageListener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response: unknown) => void,
) => boolean | void;

interface OnMessage {
  addListener(cb: MessageListener): void;
  removeListener(cb: MessageListener): void;
}

interface Runtime {
  onMessage: OnMessage;
  sendMessage(message: unknown): Promise<unknown>;
  readonly lastError?: { message?: string };
  // Present while this context belongs to a live extension; Chrome clears it the
  // instant the extension is uninstalled/reloaded ("context invalidated"), even
  // though the `chrome.runtime` object itself lingers in an already-injected
  // content script. The only reliable liveness signal a content script has.
  readonly id?: string;
}

interface TabsArea {
  query(info: Record<string, unknown>): Promise<{ id?: number }[]>;
  sendMessage(tabId: number, message: unknown): Promise<unknown>;
}

interface ChromeLike {
  runtime?: Runtime;
  tabs?: TabsArea;
}

function chrome(): ChromeLike | undefined {
  return (globalThis as { chrome?: ChromeLike }).chrome;
}

/** The `chrome.runtime` surface, or `undefined` outside the extension runtime. */
export function runtime(): Runtime | undefined {
  return chrome()?.runtime;
}

/**
 * Whether this content-script context still belongs to a live extension. Returns
 * `false` once the extension is uninstalled/reloaded — Chrome clears
 * `chrome.runtime.id` but leaves an already-injected script (and its observers)
 * running, so a script must check this to know when to go dormant. Outside the
 * extension runtime (no `chrome` at all) it also reports invalid.
 */
export function isContextValid(): boolean {
  return runtime()?.id != null;
}

/** The `chrome.tabs` surface, available in the background context only. */
export function tabs(): TabsArea | undefined {
  return chrome()?.tabs;
}
