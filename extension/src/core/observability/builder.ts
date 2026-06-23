// The event builder (tasks 4.2/4.4). Turns a `TelemetryEmit` into a canonical,
// allowlisted `BuiltEvent` — the exact JSON that goes on the wire. It attaches a
// `distinct_id` ONLY for usage events (D-OBS-6) and scrubs `$exception` into its
// content-free property shape (D-OBS-5). The builder does not gate on consent or
// validate — those are the worker's job (egress.ts) — it only constructs.

import { type EventName } from './taxonomy';
import { scrubException } from './scrubber';
import { ANON_DISTINCT_ID } from './identity';
import type { BuiltEvent } from './validator';
import type { TelemetryEmit } from './types';

/** A single PostHog `$exception_list[].stacktrace.frames[]` entry (raw frames). */
interface WireFrame {
  platform: 'web:javascript';
  filename: string;
  lineno?: number;
  colno?: number;
  in_app: true;
}

/**
 * Turn an own-bundle frame token (`<file>` or `<file>:<line>:<col>`, already
 * stripped of host origins/queries by the scrubber) into a PostHog raw frame.
 */
function toWireFrame(token: string): WireFrame {
  const pos = token.match(/^(.+?):(\d+):(\d+)$/);
  if (pos) {
    return {
      platform: 'web:javascript',
      filename: pos[1],
      lineno: Number(pos[2]),
      colno: Number(pos[3]),
      in_app: true,
    };
  }
  return { platform: 'web:javascript', filename: token, in_app: true };
}

/** Build the allowlisted property bag for an emission (scrubbing `$exception`). */
function buildProps(emit: TelemetryEmit): Record<string, unknown> {
  if (emit.name === '$exception') {
    const scrubbed = scrubException(emit.error);
    return {
      $exception_source: emit.source,
      $exception_type: scrubbed.type,
      $exception_message: scrubbed.message,
      // PostHog Error Tracking's canonical structure (task 1.2 spike shape). Frames
      // are already own-bundle-only; host-page frames were dropped in scrubbing.
      $exception_list: [
        {
          type: scrubbed.type,
          value: scrubbed.message,
          mechanism: { handled: true, synthetic: false },
          stacktrace: { type: 'raw', frames: scrubbed.frames.map(toWireFrame) },
        },
      ],
    };
  }
  return { ...(emit.props ?? {}) };
}

/**
 * Build the wire event for an emission. Every event is diagnostics and carries the
 * fixed, non-identifying anonymous constant as its `distinct_id` (PostHog requires
 * *some* id on every event). Pass `now` to pin the timestamp in tests.
 */
export async function buildEvent(emit: TelemetryEmit, now: Date = new Date()): Promise<BuiltEvent> {
  const name = emit.name as EventName;
  return {
    event: name,
    properties: buildProps(emit),
    // PostHog's top-level event timestamp — NOT a property, so it never widens the
    // allowlist surface. ISO-8601 from the emitter's wall-clock.
    timestamp: new Date(emit.ts ?? now.getTime()).toISOString(),
    distinct_id: ANON_DISTINCT_ID,
  };
}
