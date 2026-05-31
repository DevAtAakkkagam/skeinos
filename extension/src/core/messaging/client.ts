// Client side of the bus, used from content scripts and the in-page UI. `send`
// issues a typed request to the worker and awaits its `Response`; `subscribe`
// receives `Broadcast` messages until disposed.

import type {
  Broadcast,
  RequestKind,
  RequestOf,
  Response,
  ResponseDataOf,
} from '../../shared/messages';
import { runtime, type MessageListener } from './chrome';
import { appError } from './errors';
import { isBroadcastWire, requestWire } from './wire';

/**
 * Send a typed request to the service worker and resolve with its `Response`.
 * Resolves (never rejects): a missing runtime or a dropped channel surfaces as
 * an `{ ok: false, error }` envelope so callers handle failure explicitly.
 */
export async function send<K extends RequestKind>(
  request: RequestOf<K>,
): Promise<Response<ResponseDataOf<K>>> {
  const api = runtime();
  if (!api) {
    return { ok: false, error: appError('no_runtime', 'chrome.runtime is unavailable') };
  }
  try {
    const reply = await api.sendMessage(requestWire(request));
    if (reply === undefined) {
      const detail = api.lastError?.message;
      return {
        ok: false,
        error: appError('no_response', 'No response from the service worker', detail),
      };
    }
    return reply as Response<ResponseDataOf<K>>;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to reach the service worker';
    return { ok: false, error: appError('send_failed', message) };
  }
}

/** A broadcast handler. */
export type BroadcastHandler = (message: Broadcast) => void;

/**
 * Subscribe to `Broadcast` messages from the worker. Returns a dispose function
 * that removes the subscription; after disposal no further broadcasts arrive.
 */
export function subscribe(handler: BroadcastHandler): () => void {
  const api = runtime();
  if (!api) return () => undefined;

  const listener: MessageListener = (message) => {
    if (isBroadcastWire(message)) handler(message.payload);
    return undefined;
  };
  api.onMessage.addListener(listener);
  return () => api.onMessage.removeListener(listener);
}
