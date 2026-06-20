// core/messaging — the typed request/response + broadcast hub between content
// scripts/UI and the single-writer service worker (LLD §7).
//
//   Service worker  ──registerHandler(kind, fn)──▶  handlers
//        ▲                                              │
//        │ send(request) ─────────────────────────▶ dispatch ─▶ Response<T>
//        │ subscribe(handler) ◀──────────── broadcast(msg) ─────┘
//
// Importing `hub` for its side effect (the `onMessage` listener) is the
// background entrypoint's job; feature code imports the pieces it needs here.

export {
  send,
  sendWithRetry,
  subscribe,
  TRANSIENT_ERRORS,
  type BroadcastHandler,
  type RetryOptions,
} from './client';
export { isContextValid } from './chrome';
export { broadcast, dispatch, installMessageHub } from './hub';
export { registerHandler, getHandler, type Handler } from './registry';
export { appError, toAppError } from './errors';

export type {
  AppError,
  Broadcast,
  BroadcastKind,
  Request,
  RequestBase,
  RequestContract,
  RequestContracts,
  RequestKind,
  RequestOf,
  Response,
  ResponseDataOf,
  SyncStatus,
} from '../../shared/messages';
