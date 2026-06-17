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
 * Broadcast a live-state message to every open listener. Two transports are
 * needed because subscribers live in two kinds of context:
 *   - content scripts run inside host tabs, reached only via `tabs.sendMessage`;
 *   - extension pages (the side panel, options) listen on `runtime.onMessage`
 *     and never receive a `tabs.sendMessage`, so they are reached via
 *     `runtime.sendMessage`.
 * Per-listener delivery failures (a tab without our content script, no
 * extension page open) are swallowed — durable truth lives in storage, so a
 * missed live update self-heals on the next query.
 */
export async function broadcast(message: Broadcast): Promise<void> {
  const wire = broadcastWire(message);

  // Content scripts: one message per open host tab.
  const tabsApi = tabs();
  const perTab = tabsApi
    ? tabsApi.query({}).then((open) =>
        Promise.all(
          open.map((tab) =>
            tab.id === undefined
              ? undefined
              : tabsApi.sendMessage(tab.id, wire).catch(() => undefined),
          ),
        ),
      )
    : Promise.resolve();

  // Extension pages (side panel, options): one runtime-wide message. The worker
  // is excluded as the sender, so this never loops back into our own dispatch;
  // the rejection when no page is listening is expected and swallowed.
  const runtimeApi = runtime();
  const perPage = runtimeApi
    ? Promise.resolve(runtimeApi.sendMessage(wire)).catch(() => undefined)
    : Promise.resolve();

  await Promise.all([perTab, perPage]);
}

/** The single dispatch listener. Only handles request frames; ignores the rest. */
const onMessage: MessageListener = (message, _sender, sendResponse) => {
  if (!isRequestWire(message)) return undefined; // not ours — let other listeners see it
  // Keep the message channel open: dispatch resolves to a Response and we reply.
  void dispatch(message.payload).then(sendResponse);
  return true;
};

let installed = false;

/**
 * Install the single service-worker dispatch listener. MUST be called only from
 * the background entry — NEVER as a passive import side effect.
 *
 * Extension pages (the side panel, options) and content scripts import this
 * module *transitively* through the `core/messaging` barrel just to get `send`,
 * `subscribe`, and the message types. If the listener registered itself at module
 * load (as it used to), every one of those contexts would also become a request
 * responder — dispatching `workspace.*` against its OWN empty handler registry and
 * replying `unknown_kind`. With more than one such page open, a page receives
 * another page's request and races the real worker's reply, so callers
 * intermittently get `unknown_kind` instead of their data (observed bug). Gating
 * installation behind an explicit worker-only call keeps the dispatch listener
 * singular and in the single writer alone.
 *
 * Idempotent and synchronous (SW-3): safe to call on every cold worker start.
 */
export function installMessageHub(): void {
  if (installed) return;
  const api = runtime();
  if (!api) return; // no runtime yet (e.g. tests before the chrome shim) — retry next call
  api.onMessage.addListener(onMessage);
  installed = true;
}
