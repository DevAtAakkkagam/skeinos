// Minimal structural view of the `chrome.alarms` API the canary uses, reached via
// `globalThis` (the same pattern as core/messaging/chrome.ts and
// core/settings/chrome.ts). Keeping the surface tiny and structural means the
// canary is fake-able in tests and never depends on ambient extension globals or
// `@types/chrome`. The service worker schedules durable work with alarms, never
// `setTimeout`/`setInterval`, which a terminated worker would lose ([SW-4]).

import { extApi } from '../../core/platform/ext-api';

/** A fired alarm — we only care about its `name`. */
export interface Alarm {
  name: string;
}

/** A `chrome.alarms.onAlarm` listener. */
export type AlarmListener = (alarm: Alarm) => void;

interface OnAlarm {
  addListener(cb: AlarmListener): void;
  removeListener(cb: AlarmListener): void;
}

interface AlarmsArea {
  create(name: string, info: { periodInMinutes?: number; delayInMinutes?: number }): void;
  clear(name: string): Promise<boolean>;
  onAlarm: OnAlarm;
}

interface ChromeLike {
  alarms?: AlarmsArea;
}

function chrome(): ChromeLike | undefined {
  return extApi<ChromeLike>();
}

/** The `chrome.alarms` surface, or `undefined` outside the extension runtime. */
export function alarms(): AlarmsArea | undefined {
  return chrome()?.alarms;
}
