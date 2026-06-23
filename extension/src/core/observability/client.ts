// Content/UI-side telemetry client (task 5.1). Any surface — content script,
// shadow-DOM UI, or the worker itself — records an event by sending it to the
// worker, the single egress (D-OBS-2). Fire-and-forget: emission never blocks the
// caller and a transport hiccup never throws into product code. Consent gating,
// payload building, validation, and sending all happen worker-side.

import { send } from '../messaging';
import type { EventName, ExceptionSource } from './taxonomy';
import type { SerializedError, TelemetryEmit } from './types';

/** Send a telemetry emission to the worker. Resolves once the worker replies. */
export async function emit(event: TelemetryEmit): Promise<void> {
  await send({ kind: 'telemetry.emit', event });
}

/**
 * Record a non-exception diagnostics event (e.g. adapter health). Fire-and-forget —
 * errors are swallowed so telemetry can never break a feature. `props` must already
 * be allowlisted (enum/version values); the worker drops anything that is not.
 */
export function track(
  name: Exclude<EventName, '$exception'>,
  props?: Record<string, unknown>,
): void {
  void emit({ name, props }).catch(() => undefined);
}

/** Reduce any thrown value to the serializable error parts we send. */
export function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { message: typeof error === 'string' ? error : 'Unknown error' };
}

/**
 * Capture a crash from a given runtime context. The worker scrubs the message and
 * drops host-page stack frames before anything is sent. Fire-and-forget.
 */
export function captureException(source: ExceptionSource, error: unknown): void {
  void emit({ name: '$exception', source, error: serializeError(error) }).catch(() => undefined);
}

interface GlobalEvents {
  addEventListener?: (type: string, cb: (e: unknown) => void) => void;
  removeEventListener?: (type: string, cb: (e: unknown) => void) => void;
}

/**
 * Install global `error` + `unhandledrejection` listeners that capture crashes for
 * the given context (task 6.6). Works in every context — the service worker
 * (`self`), the content script (`window`), and the shadow-DOM UI (`window`) — via
 * `globalThis`. Returns a disposer; a no-op where `addEventListener` is absent.
 */
export function installExceptionCapture(source: ExceptionSource): () => void {
  const g = globalThis as GlobalEvents;
  if (!g.addEventListener || !g.removeEventListener) return () => undefined;
  const onError = (e: unknown) => {
    const ev = e as { error?: unknown; message?: string };
    captureException(source, ev.error ?? new Error(ev.message ?? 'error'));
  };
  const onRejection = (e: unknown) => {
    captureException(source, (e as { reason?: unknown }).reason);
  };
  g.addEventListener('error', onError);
  g.addEventListener('unhandledrejection', onRejection);
  return () => {
    g.removeEventListener?.('error', onError);
    g.removeEventListener?.('unhandledrejection', onRejection);
  };
}
