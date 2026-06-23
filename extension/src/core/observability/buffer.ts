// The durable telemetry buffer (design D-OBS-8, task 5.3). Events queue in
// `chrome.storage.local` — NOT worker memory ([SW-2]) — so they survive a
// service-worker teardown and are flushed on the next alarm. The buffer holds
// already-built, already-validated wire events; their consent category is derived
// from the event name (taxonomy.categoryOf), so dropping a category on opt-out
// needs no extra per-event tag.

import { storageLocal } from '../settings/chrome';
import { categoryOf, type Category, type EventName } from './taxonomy';
import type { BuiltEvent } from './validator';

/** The single `chrome.storage.local` key holding the buffered event array. */
export const BUFFER_KEY = 'skeinos.telemetryBuffer';

/** Read the buffered events (missing/unreadable storage → empty). */
export async function readBuffer(): Promise<BuiltEvent[]> {
  const area = storageLocal();
  if (!area) return [];
  const got = await area.get(BUFFER_KEY);
  const arr = got[BUFFER_KEY];
  return Array.isArray(arr) ? (arr as BuiltEvent[]) : [];
}

/** Overwrite the buffer with `events`. */
export async function writeBuffer(events: BuiltEvent[]): Promise<void> {
  const area = storageLocal();
  if (!area) return;
  await area.set({ [BUFFER_KEY]: events });
}

/** Append one event; returns the new buffer length. */
export async function enqueue(event: BuiltEvent): Promise<number> {
  const events = await readBuffer();
  events.push(event);
  await writeBuffer(events);
  return events.length;
}

/** Drop every buffered event of `category` (opt-out, task 5.4). */
export async function dropCategory(category: Category): Promise<void> {
  const events = await readBuffer();
  const kept = events.filter((e) => categoryOf(e.event as EventName) !== category);
  if (kept.length !== events.length) await writeBuffer(kept);
}

/** Empty the buffer entirely. */
export async function clearBuffer(): Promise<void> {
  await writeBuffer([]);
}
