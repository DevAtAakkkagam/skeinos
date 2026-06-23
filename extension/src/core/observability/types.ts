// Shared telemetry payload shapes that cross the messaging boundary. Content
// scripts and the shadow-DOM UI never POST telemetry — they `send` one of these to
// the worker (the single egress, D-OBS-2), which gates, builds, validates, and
// sends. Kept dependency-light so the leaf messaging client can import it.

import type { EventName, ExceptionSource } from './taxonomy';

/** A serialized error crossing the messaging boundary (no live Error object). */
export interface SerializedError {
  name?: string;
  message?: string;
  stack?: string;
}

/**
 * A telemetry emission request. Either a normal taxonomy event with already-built
 * allowlisted props, or a raw `$exception` the worker scrubs before sending. `ts`
 * is the emitter's wall-clock (epoch ms); the worker stamps one if absent.
 */
export type TelemetryEmit =
  | { name: Exclude<EventName, '$exception'>; props?: Record<string, unknown>; ts?: number }
  | { name: '$exception'; source: ExceptionSource; error: SerializedError; ts?: number };
