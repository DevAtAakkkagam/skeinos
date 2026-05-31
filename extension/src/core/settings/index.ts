// Typed settings accessors over `chrome.storage.local` (D4). Reads merge the
// stored partial onto DEFAULT_SETTINGS so missing keys are always defined and
// old installs stay valid as later features add keys (design D-2). Writes are
// shallow-merged partials. Live updates ride `chrome.storage.onChanged` (D-4) —
// no custom bus and no messaging-hub dependency.
//
// Unlike the workspace store, settings are NOT funnelled through the service
// worker: `chrome.storage.local` is itself multi-context-safe, so any surface
// (options page, overlay) may read and write directly.

import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  type Settings,
} from '../../shared/settings';
import { storage, storageLocal, type StorageChange } from './chrome';

export { DEFAULT_SETTINGS, SETTINGS_KEY, type Settings } from '../../shared/settings';

function mergeStored(stored: unknown): Settings {
  const partial = (stored ?? {}) as Partial<Settings>;
  return { ...DEFAULT_SETTINGS, ...partial };
}

/** Read settings: defaults merged with the stored partial. Always complete. */
export async function getSettings(): Promise<Settings> {
  const area = storageLocal();
  if (!area) return { ...DEFAULT_SETTINGS };
  const got = await area.get(SETTINGS_KEY);
  return mergeStored(got[SETTINGS_KEY]);
}

/** Write a partial update, shallow-merged onto the current settings. */
export async function setSettings(partial: Partial<Settings>): Promise<void> {
  const area = storageLocal();
  if (!area) return;
  const next = { ...(await getSettings()), ...partial };
  await area.set({ [SETTINGS_KEY]: next });
}

export type SettingsHandler = (settings: Settings) => void;

/**
 * Subscribe to settings changes; returns a dispose function. The handler fires
 * with the full merged settings whenever the stored value changes (e.g. an
 * options-page edit reflecting live in an open overlay).
 */
export function subscribeSettings(handler: SettingsHandler): () => void {
  const ns = storage();
  if (!ns) return () => {};
  const listener = (changes: Record<string, StorageChange>, areaName: string) => {
    if (areaName !== 'local' || !(SETTINGS_KEY in changes)) return;
    handler(mergeStored(changes[SETTINGS_KEY].newValue));
  };
  ns.onChanged.addListener(listener);
  return () => ns.onChanged.removeListener(listener);
}
