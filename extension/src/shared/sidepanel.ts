// A tiny one-way control message: "open the Skeinos side panel for my tab".
//
// This is deliberately NOT a `core/messaging` request frame. `chrome.sidePanel.open()`
// must run inside the user gesture that asked for it, and it needs the *sender's* tab
// id — neither of which the request hub exposes (its handlers receive only the request
// payload, never the `sender`). So the background registers a dedicated, gesture-aware
// `runtime.onMessage` listener for this shape (see `background/sidePanel.ts`), and the
// in-page UI fires it with a plain `chrome.runtime.sendMessage`. Living in `shared/`
// keeps both ends agreeing on the wire shape without the content bundle importing any
// worker-only code.

export const OPEN_SIDE_PANEL = 'skeinos:open-side-panel' as const;

export interface OpenSidePanelMessage {
  type: typeof OPEN_SIDE_PANEL;
}

/** Narrow an unknown `runtime.onMessage` frame to the open-side-panel control. */
export function isOpenSidePanelMessage(message: unknown): message is OpenSidePanelMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === OPEN_SIDE_PANEL
  );
}
