// Messaging contracts. Content scripts and the in-page UI never write
// storage directly — they `send` a typed `Request` to the service worker (the
// single writer), which dispatches by `kind` and returns a `Response<T>`. The
// worker also `broadcast`s `Broadcast` messages so every open LLM tab stays
// consistent.
//
// This change ships the *channel + envelope* only. The concrete request kinds
// from the contract (`workspace.query`, `workspace.mutate`, `search.run`,
// `prompt.insert`, `profile.activate`, `multimodel.dispatch`, `sync.now`) carry
// payload types (`WorkspaceSelector`, `MutationOp`, …) owned by later feature
// changes. So `Request` is *open*: a feature change registers its kinds by
// augmenting `RequestContracts` via declaration merging — it never edits the hub
// (design D-3 seam). `Broadcast` is fully enumerated here.

import type { PlatformId } from './types';

// ---------------------------------------------------------------------------
// Error envelope (errors are values, not exceptions — design D-2)
// ---------------------------------------------------------------------------

/**
 * A serialization-safe error that crosses the messaging boundary in place of a
 * thrown exception. `code` is a stable machine token; `message` is human-facing;
 * `detail` carries optional structured context.
 */
export interface AppError {
  code: string;
  message: string;
  detail?: unknown;
}

/** Every request resolves to exactly one of these — never a rejection. */
export type Response<T> = { ok: true; data: T } | { ok: false; error: AppError };

// ---------------------------------------------------------------------------
// Request contract map (augmentable — the handler-registry seam)
// ---------------------------------------------------------------------------

/** The shape every contract entry follows: a request payload and its result. */
export interface RequestContract {
  /** Fields carried alongside `kind` in the request. */
  request: Record<string, unknown>;
  /** The `data` returned in a successful `Response`. */
  response: unknown;
}

/**
 * Maps each request `kind` to its {@link RequestContract}. Empty here by design:
 * feature changes add their kinds via declaration merging, e.g.
 *
 * ```ts
 * declare module '@/shared/messages' {
 *   interface RequestContracts {
 *     'workspace.query': { request: { selector: WorkspaceSelector }; response: WorkspaceSnapshot };
 *   }
 * }
 * ```
 *
 * so the typed `Request` union and `registerHandler`/`send` grow without
 * touching `core/messaging`.
 */
// Intentionally empty: feature modules augment this via declaration merging.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface RequestContracts {}

/** Every registered request `kind`. */
export type RequestKind = keyof RequestContracts & string;

/** The concrete request object for a single `kind` (`{ kind } & payload`). */
export type RequestOf<K extends RequestKind> = { kind: K } & RequestContracts[K]['request'];

/** The success `data` type returned for a single `kind`. */
export type ResponseDataOf<K extends RequestKind> = RequestContracts[K]['response'];

/** The discriminated union of every registered request. */
export type Request = { [K in RequestKind]: RequestOf<K> }[RequestKind];

/**
 * The wire-level shape every request shares. Used by the transport internals,
 * which dispatch by `kind` and so don't need the precise (and initially empty)
 * `Request` union.
 */
export interface RequestBase {
  kind: string;
}

// ---------------------------------------------------------------------------
// Broadcast channel (SW → all subscribed tabs)
// ---------------------------------------------------------------------------

/**
 * Sync progress carried by the `sync.status` broadcast. The M5 sync change owns
 * the authoritative shape; this is the minimal status the broadcast contract
 * needs today so the union below is concrete.
 */
export type SyncStatus =
  | { state: 'idle'; lastSyncedAt?: number }
  | { state: 'syncing' }
  | { state: 'error'; error: AppError };

/** Live state pushed from the worker so every open tab self-updates. */
export type Broadcast =
  | { kind: 'state.changed'; stores: string[] }
  | { kind: 'sync.status'; status: SyncStatus }
  | { kind: 'platform.degraded'; platform: PlatformId }
  // Bulk-index progress (D-4). The indexer emits `{ done, total }` as it works so
  // the downstream "indexing N…" indicator (C11) can render it later; C8 ships the
  // signal but no indicator UI. A dedicated variant keeps `state.changed`'s payload
  // unchanged for its many existing re-query subscribers.
  | { kind: 'index.progress'; done: number; total: number };

/** The `kind` discriminants a {@link Broadcast} can carry. */
export type BroadcastKind = Broadcast['kind'];
