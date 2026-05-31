// The handler registry — the seam feature changes use to add their request
// kinds without editing the hub (design D-3). Feature modules call
// `registerHandler(kind, fn)` at *their* module top level (in the background
// context); the hub looks handlers up by `kind` when dispatching.

import type { RequestBase, RequestKind, RequestOf, ResponseDataOf } from '../../shared/messages';

/** A handler for one request `kind`: maps the request to its result (sync or async). */
export type Handler<K extends RequestKind> = (
  request: RequestOf<K>,
) => ResponseDataOf<K> | Promise<ResponseDataOf<K>>;

/** Internal, kind-erased handler shape the dispatcher stores and invokes. */
type AnyHandler = (request: RequestBase) => unknown;

const handlers = new Map<string, AnyHandler>();

/**
 * Register the handler for a request `kind`. Call at module load so the handler
 * is present on every worker wake (SW-3). Registering a kind twice replaces the
 * previous handler.
 */
export function registerHandler<K extends RequestKind>(kind: K, fn: Handler<K>): void {
  handlers.set(kind, fn as AnyHandler);
}

/** Look up the handler for a `kind`, or `undefined` if none is registered. */
export function getHandler(kind: string): AnyHandler | undefined {
  return handlers.get(kind);
}

/** Remove every registered handler. Test-only seam. */
export function __clearHandlers(): void {
  handlers.clear();
}
