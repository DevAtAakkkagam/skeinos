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

// Transport-level failures from a service worker that is still waking from MV3
// idle teardown: `chrome.runtime.sendMessage` resolves with no response, or the
// channel drops, before the worker is ready to dispatch. These are the only
// *transient* symptoms — retrying them lets a cold-start round-trip recover.
// Logic and domain errors (`unknown_kind`, `handler_error`, validation) are real
// failures and are returned on the first attempt (retrying just masks the bug).
export const TRANSIENT_ERRORS: ReadonlySet<string> = new Set(['no_response', 'send_failed']);

/** Options for {@link sendWithRetry}. */
export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default 8. */
  tries?: number;
  /** Delay between attempts, in milliseconds. Default 150. */
  delayMs?: number;
}

/**
 * Send a request, retrying only *transient transport* failures from a waking
 * worker (`no_response`, `send_failed`), bounded by `tries` with `delayMs`
 * between attempts. Resolves with the first successful `Response` or, once the
 * budget is exhausted, the last error envelope. Logic/domain errors are returned
 * immediately without retry. Opt-in per call: only idempotent reads should use
 * this, never a mutation whose lost response would be replayed.
 */
export async function sendWithRetry<K extends RequestKind>(
  request: RequestOf<K>,
  { tries = 8, delayMs = 150 }: RetryOptions = {},
): Promise<Response<ResponseDataOf<K>>> {
  let res = await send(request);
  for (let i = 1; i < tries && !res.ok && TRANSIENT_ERRORS.has(res.error.code); i++) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    res = await send(request);
  }
  // Budget exhausted on a still-transient failure: surface the real code so the
  // live failure mode is observable rather than assumed (diagnostic only — the
  // returned envelope is unchanged).
  if (!res.ok && TRANSIENT_ERRORS.has(res.error.code)) {
    console.warn('[Skeinos] sendWithRetry exhausted budget', request.kind, res.error.code);
  }
  return res;
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
