// Minimal structural view of the `chrome.storage` APIs the settings module
// uses, reached via `globalThis` (the same pattern as core/messaging/chrome.ts
// and core/store/envelope.ts). Keeping the surface tiny and structural means the
// accessors work under test with a fake `chrome` and never depend on ambient
// extension globals or `@types/chrome`.

export interface StorageChange {
  oldValue?: unknown;
  newValue?: unknown;
}

/** A `chrome.storage.onChanged` listener. */
export type StorageChangeListener = (
  changes: Record<string, StorageChange>,
  areaName: string,
) => void;

interface StorageArea {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

interface OnChanged {
  addListener(cb: StorageChangeListener): void;
  removeListener(cb: StorageChangeListener): void;
}

interface StorageNS {
  local: StorageArea;
  onChanged: OnChanged;
}

interface ChromeLike {
  storage?: StorageNS;
}

function chrome(): ChromeLike | undefined {
  return (globalThis as { chrome?: ChromeLike }).chrome;
}

/** The `chrome.storage` surface, or `undefined` outside the extension runtime. */
export function storage(): StorageNS | undefined {
  return chrome()?.storage;
}

/** The `chrome.storage.local` area, or `undefined` outside the runtime. */
export function storageLocal(): StorageArea | undefined {
  return chrome()?.storage?.local;
}
