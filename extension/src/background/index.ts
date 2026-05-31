// Importing the hub for its side effect registers the single `onMessage`
// dispatch listener synchronously at worker load (SW-3), before `initBackground`
// runs — so it survives every cold start. Feature changes register their `kind`
// handlers via `registerHandler` from their own modules.
import '../core/messaging/hub';

// Service-worker init. No durable state lives here: MV3 kills the worker after
// ~30s idle, so future state must rehydrate from IndexedDB (see CLAUDE.md). For
// bootstrap this only proves the worker registers.
export function initBackground(): void {
  console.log('[Skeinos] background service worker registered');
}
