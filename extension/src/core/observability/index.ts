// core/observability — diagnostics-only telemetry (the `observability` change).
// Crashes (`$exception`) + adapter health, no usage analytics. The service worker is
// the single egress (D-OBS-2): content/UI call `track`/`captureException`, which
// message the worker; the worker gates on the diagnostics consent flag, builds an
// allowlisted payload (PII-by-construction, D-OBS-5), buffers it durably, and POSTs
// to PostHog EU with no SDK (D-OBS-3).
//
// Worker entry wires `registerTelemetryHandlers()` (ingress) + `registerTelemetry
// Flush()` (durable batched egress + instant opt-out). Feature code emits via the
// leaf `client` re-exports below.

export { track, captureException, installExceptionCapture, emit, serializeError } from './client';
export {
  registerTelemetryHandlers,
  registerTelemetryFlush,
  recordEvent,
  flush,
  postHogTransport,
  __setTransport,
  __resetTransport,
  type Transport,
  type RecordResult,
} from './egress';
export { buildEvent } from './builder';
export { auditEvent, isValidEvent, type BuiltEvent } from './validator';
export { ANON_DISTINCT_ID } from './identity';
export { scrubException, scrubMessage, scrubFrames } from './scrubber';
export {
  EVENT_NAMES,
  EVENT_ALLOWLIST,
  categoryOf,
  type EventName,
  type AnchorKey,
  type FallbackReason,
  type ExceptionSource,
  type Category,
} from './taxonomy';
export type { TelemetryEmit, SerializedError } from './types';
