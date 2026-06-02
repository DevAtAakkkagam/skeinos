// Importing the hub for its side effect registers the single `onMessage` dispatch
// listener synchronously at worker load (SW-3), before `initBackground` runs — so
// it survives every cold start. Feature changes register their `kind` handlers via
// `registerHandler` from their own modules.
import '../core/messaging/hub';
import { registerAdapterHandlers, registerCanary, registerResilienceHandlers } from '../adapters';
import { registerFolderHandlers } from '../core/folders';
import { registerSidePanel } from './sidePanel';

// Register the scheduled canary as a top-level side effect at worker load (SW-3):
// the `chrome.alarms` schedule + its `onAlarm` listener must exist on every cold
// start, before any async init, so a degraded platform keeps being re-surfaced.
registerCanary();

// Side-panel open behavior + per-host enablement, also top-level (SW-3) so the
// `setPanelBehavior` call and the tab listeners survive every cold start. No-op
// on browsers without `chrome.sidePanel` (Firefox).
registerSidePanel();

// Service-worker init. No durable state lives here: MV3 kills the worker after
// ~30s idle, so future state must rehydrate from IndexedDB (see CLAUDE.md).
// Feature handlers are (re)registered on every activation so they survive cold
// starts. For bootstrap this only proves the worker registers.
export function initBackground(): void {
  registerAdapterHandlers();
  registerResilienceHandlers();
  registerFolderHandlers();
  console.log('[Skeinos] background service worker registered');
}
