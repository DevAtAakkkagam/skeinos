// Minimal structural view of `chrome.alarms` for the telemetry flush schedule,
// reached via `globalThis` (the same pattern as core/settings/chrome.ts). The
// worker batches egress on a durable alarm, never `setTimeout`/`setInterval`
// ([SW-4]) — a terminated worker would lose a timer but keeps its alarm.

import { extApi } from '../platform/ext-api';

/** A fired alarm — we only care about its `name`. */
export interface Alarm {
  name: string;
}

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

/** The `chrome.alarms` surface, or `undefined` outside the extension runtime. */
export function alarms(): AlarmsArea | undefined {
  return extApi<ChromeLike>()?.alarms;
}
