// The service worker's single WorkspaceStore handle (SW-1: single writer). Opened
// lazily and cached for the life of the worker; because MV3 cold-starts the worker
// the module-level cache is rebuilt from the durable IndexedDB on each wake — no
// memory-only state is assumed (SW-2). Feature handlers call `workspaceStore()`.

import { openWorkspaceStore, type WorkspaceStore } from './index';

let cached: Promise<WorkspaceStore> | null = null;

/** Resolve the worker's shared store, opening the database on first use. A
 *  successful open is cached for the life of the worker (single open per
 *  generation); a *failed* open is NOT cached — it resets the handle so the next
 *  call re-opens, rather than poisoning every later read/write with the cached
 *  rejection until the worker restarts. */
export function workspaceStore(): Promise<WorkspaceStore> {
  if (!cached) {
    const opening = openWorkspaceStore();
    opening.catch(() => {
      // Only clear if this rejected open is still the cached one (a later
      // successful open may have already replaced it).
      if (cached === opening) cached = null;
    });
    cached = opening;
  }
  return cached;
}

/** Test-only: drop the cached handle so the next call reopens a fresh database. */
export function __resetWorkspaceStore(): void {
  cached = null;
}
