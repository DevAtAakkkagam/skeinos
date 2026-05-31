// Service-worker init. No durable state lives here: MV3 kills the worker after
// ~30s idle, so future state must rehydrate from IndexedDB (see CLAUDE.md). For
// bootstrap this only proves the worker registers.
export function initBackground(): void {
  console.log('[Skeinos] background service worker registered');
}
