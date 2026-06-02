// The service worker's single WorkspaceStore handle (SW-1: single writer). Opened
// lazily and cached for the life of the worker; because MV3 cold-starts the worker
// the module-level cache is rebuilt from the durable IndexedDB on each wake — no
// memory-only state is assumed (SW-2). Feature handlers call `workspaceStore()`.

import { openWorkspaceStore, type WorkspaceStore } from './index';

let cached: Promise<WorkspaceStore> | null = null;

/** Resolve the worker's shared store, opening the database on first use. */
export function workspaceStore(): Promise<WorkspaceStore> {
  if (!cached) cached = openWorkspaceStore();
  return cached;
}

/** Test-only: drop the cached handle so the next call reopens a fresh database. */
export function __resetWorkspaceStore(): void {
  cached = null;
}
