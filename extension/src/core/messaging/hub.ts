// Service-worker side of the bus. Importing this module *registers the single
// `onMessage` dispatch listener synchronously* (design D-3 / guardrail SW-3), so
// it is present on every cold worker start before any async init runs. It then
// dispatches each request to its registered handler and fans broadcasts out to
// all open tabs.

import type { Broadcast, RequestBase, Response } from '../../shared/messages';
import { runtime, tabs, type MessageListener } from './chrome';
import { appError, toAppError } from './errors';
import { getHandler } from './registry';
import { broadcastWire, isRequestWire } from './wire';

/**
 * Run a request through its handler and return a `Response`. Never throws and
 * never rejects: an unknown `kind` and a throwing handler both resolve to an
 * `{ ok: false, error }` envelope (design D-2). This is the pure dispatch core,
 * independent of `chrome`.
 */
export async function dispatch(request: RequestBase): Promise<Response<unknown>> {
  const handler = getHandler(request.kind);
  if (!handler) {
    return {
      ok: false,
      error: appError('unknown_kind', `No handler registered for "${request.kind}"`),
    };
  }
  try {
    const data = await handler(request);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toAppError(err) };
  }
}

/**
 * Broadcast a live-state message to every open tab. Per-tab delivery failures
 * (a tab without our content script, a discarded tab) are swallowed — durable
 * truth lives in storage, so a missed live update self-heals on the next query.
 */
export async function broadcast(message: Broadcast): Promise<void> {
  const api = tabs();
  if (!api) return;
  const wire = broadcastWire(message);
  const open = await api.query({});
  await Promise.all(
    open.map((tab) =>
      tab.id === undefined ? undefined : api.sendMessage(tab.id, wire).catch(() => undefined),
    ),
  );
}

/** The single dispatch listener. Only handles request frames; ignores the rest. */
const onMessage: MessageListener = (message, _sender, sendResponse) => {
  if (!isRequestWire(message)) return undefined; // not ours — let other listeners see it
  // Keep the message channel open: dispatch resolves to a Response and we reply.
  void dispatch(message.payload).then(sendResponse);
  return true;
};

// Register synchronously at module load (SW-3). A no-op outside the runtime.
runtime()?.onMessage.addListener(onMessage);
