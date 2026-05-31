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

/** The `chrome.tabs` surface, available in the background context only. */
export function tabs(): TabsArea | undefined {
  return chrome()?.tabs;
}
