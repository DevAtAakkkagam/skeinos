// The background entry is the ONLY place that installs the worker's `onMessage`
// dispatch listener (`installMessageHub`). It is an explicit call, not an import
// side effect: extension pages and content scripts pull the messaging barrel in
// transitively for `send`/`subscribe`, and must NOT become request responders —
// see `installMessageHub`'s contract. Feature changes register their `kind`
// handlers via `registerHandler` from their own modules.
import { installMessageHub } from '../core/messaging';
import { registerAdapterHandlers, registerCanary, registerResilienceHandlers } from '../adapters';
import { registerFolderHandlers } from '../core/folders';
import { registerSidePanel } from './sidePanel';

// ALL registration below is a top-level module side effect (SW-3), run on every
// worker script evaluation. This is load-bearing: MV3 tears the worker down after
// ~30s idle and re-evaluates the module graph on the next event, but the
// `defineBackground` callback (see entrypoints/background.ts) does NOT reliably
// re-run on a wake. Anything that must exist before the first dispatched message
// — the `onMessage` listener, alarms, and every request handler — therefore has
// to register at module top level, NOT inside that callback. Registering the
// request handlers inside `initBackground` previously left a woken worker with
// the hub listener but no handlers, so every request returned `unknown_kind`.

// Scheduled canary: the `chrome.alarms` schedule + its `onAlarm` listener must
// exist on every cold start so a degraded platform keeps being re-surfaced.
registerCanary();

// Side-panel open behavior + per-host enablement: the `setPanelBehavior` call and
// tab listeners must survive every cold start. No-op without `chrome.sidePanel`.
registerSidePanel();

// Request handlers (workspace query/mutate, adapter health/degraded). These MUST
// be top-level so a woken worker can answer the side panel's first message.
registerAdapterHandlers();
registerResilienceHandlers();
registerFolderHandlers();

// Install the dispatch listener LAST — after every handler is registered — so a
// woken worker never answers a request before its handlers exist. Worker-only.
installMessageHub();

// Called from the `defineBackground` entry purely to log that the worker booted;
// registration above already happened at module load and does not depend on this.
export function initBackground(): void {
  console.log('[Skeinos] background service worker registered');
}
