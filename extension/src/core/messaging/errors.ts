// Building and normalizing the `AppError` envelope (design D-2). Anything a
// handler throws is coerced here into a serialization-safe value so no exception
// crosses the messaging boundary.

import type { AppError } from '../../shared/messages';

/** Construct a typed error envelope. */
export function appError(code: string, message: string, detail?: unknown): AppError {
  return detail === undefined ? { code, message } : { code, message, detail };
}

/** Coerce an unknown throw into an `AppError`, preserving its message. */
export function toAppError(err: unknown): AppError {
  if (err instanceof Error) return appError('handler_error', err.message);
  if (typeof err === 'string') return appError('handler_error', err);
  return appError('handler_error', 'Handler threw a non-error value', err);
}
