// The worker-side egress pipeline (design D-OBS-2/7/8, tasks 5.1–5.5). The service
// worker is the SINGLE telemetry egress: content/UI emit a `telemetry.emit` request
// through the messaging hub, and only this module gates on consent, builds the
// payload, validates it against the allowlist, buffers it durably, and POSTs to
// PostHog EU. Nothing else in the system sends telemetry.
//
//   emit ─▶ [consent gate] ─▶ buildEvent ─▶ [allowlist validate] ─▶ enqueue
//                                                                      │
//   chrome.alarms tick / size threshold ─▶ flush ─▶ [re-check consent] ─▶ POST
//
// Opt-out is local-authoritative and instant: flipping a flag off drops new events
// at the gate and DROPS (not drains) that category's buffered events.

import { getSettings, subscribeSettings } from '../settings';
import type { Settings } from '../../shared/settings';
import { registerHandler } from '../messaging';
import { POSTHOG_BATCH_URL, POSTHOG_PROJECT_KEY } from './config';
import { alarms, type Alarm } from './chrome';
import { buildEvent } from './builder';
import { auditEvent, type BuiltEvent } from './validator';
import {
  clearBuffer,
  dropCategory,
  enqueue,
  readBuffer,
  writeBuffer,
} from './buffer';
import type { TelemetryEmit } from './types';

declare module '../../shared/messages' {
  interface RequestContracts {
    'telemetry.emit': {
      request: { event: TelemetryEmit };
      response: { accepted: boolean };
    };
  }
}

/** The flush alarm name + cadence. 30 min ≤ a reasonable batching window. */
export const FLUSH_ALARM = 'skeinos.telemetry-flush';
export const FLUSH_PERIOD_MINUTES = 30;
/** Flush eagerly once the buffer reaches this many events (size threshold). */
export const FLUSH_THRESHOLD = 20;

/** True when diagnostics consent is on (the only telemetry stream). */
function consented(settings: Settings): boolean {
  return settings.diagnosticsOptIn === true;
}

// ---------------------------------------------------------------------------
// Transport (injectable for tests — the fake-transport seam, task 8.1)
// ---------------------------------------------------------------------------

/** A transport sends a batch of wire events and resolves true on success. */
export type Transport = (events: BuiltEvent[]) => Promise<boolean>;

/** The real transport: a plain CORS `fetch` POST to PostHog EU `/batch` — no SDK. */
export const postHogTransport: Transport = async (events) => {
  try {
    const res = await fetch(POSTHOG_BATCH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ api_key: POSTHOG_PROJECT_KEY, batch: events }),
    });
    return res.ok;
  } catch {
    return false; // network failure → keep the consented events buffered to retry
  }
};

let transport: Transport = postHogTransport;

/** Override the transport (test seam). */
export function __setTransport(fn: Transport): void {
  transport = fn;
}

/** Restore the real PostHog transport (test seam). */
export function __resetTransport(): void {
  transport = postHogTransport;
}

// ---------------------------------------------------------------------------
// Record + flush
// ---------------------------------------------------------------------------

/** The outcome of recording an emission (for the handler reply + tests). */
export interface RecordResult {
  accepted: boolean;
  reason?: 'consent_off' | 'invalid';
}

/**
 * Worker entry for one emission: gate on consent, build, validate, enqueue. Drops
 * (and never sends) anything whose category consent is off or that violates the
 * allowlist. Triggers an eager flush at the size threshold.
 */
export async function recordEvent(emit: TelemetryEmit, now: Date = new Date()): Promise<RecordResult> {
  const settings = await getSettings();
  if (!consented(settings)) return { accepted: false, reason: 'consent_off' };

  const event = await buildEvent(emit, now);
  if (auditEvent(event).length > 0) return { accepted: false, reason: 'invalid' };

  const size = await enqueue(event);
  if (size >= FLUSH_THRESHOLD) await flush();
  return { accepted: true };
}

/**
 * Flush the durable buffer: re-check consent for every buffered event (dropping any
 * whose category was turned off after buffering), POST the still-consented ones,
 * and clear them on success (retain only on a transport failure, to retry).
 */
export async function flush(): Promise<void> {
  const buffered = await readBuffer();
  if (buffered.length === 0) return;

  // Re-check consent at flush time; if diagnostics was turned off after buffering,
  // drop the queue rather than send it.
  if (!consented(await getSettings())) {
    await clearBuffer();
    return;
  }

  const ok = await transport(buffered);
  // Empty on success; on a transport failure retain the buffer to retry.
  if (ok) await writeBuffer([]);
}

// ---------------------------------------------------------------------------
// Worker registration (top-level side effects, SW-3)
// ---------------------------------------------------------------------------

/** Register the `telemetry.emit` handler — the single ingress for content/UI events. */
export function registerTelemetryHandlers(): void {
  registerHandler('telemetry.emit', async (req) => {
    const result = await recordEvent(req.event);
    return { accepted: result.accepted };
  });
}

/**
 * Create the flush alarm + its listener, and subscribe to consent withdrawal so
 * turning diagnostics off instantly drops the buffered events (opt-out, 5.4). Top-
 * level side effect at worker load so it survives every cold start.
 */
export function registerTelemetryFlush(): void {
  const area = alarms();
  if (area) {
    area.create(FLUSH_ALARM, { periodInMinutes: FLUSH_PERIOD_MINUTES });
    area.onAlarm.addListener((alarm: Alarm) => {
      if (alarm.name === FLUSH_ALARM) void flush();
    });
  }
  // Instant opt-out: drop buffered diagnostics events when the flag is turned off.
  subscribeSettings((s) => {
    if (s.diagnosticsOptIn !== true) void dropCategory('diagnostics');
  });
}
