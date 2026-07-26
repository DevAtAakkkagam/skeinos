// Content/UI-side folder client. Imports only `send` + the payload types, never
// the store — so the sidebar bundle stays free of IndexedDB code. The request-kind
// contracts are declared in `handlers.ts`; declaration merging is global, so these
// `send` calls are fully typed here without importing the worker module.

import { send, sendWithRetry } from '../messaging';
import type {
  MutationOp,
  MutationResult,
  WorkspaceSelector,
  WorkspaceSnapshot,
} from '../../shared/workspace';
import type { PlatformId } from '../../shared/types';
import type { Response } from '../../shared/messages';

/** Run a workspace read against the worker. Reads are idempotent, so they opt
 *  into transient-transport retry — a cold/waking worker recovers transparently. */
export function queryWorkspaceRemote(
  selector: WorkspaceSelector,
): Promise<Response<WorkspaceSnapshot>> {
  return sendWithRetry({ kind: 'workspace.query', selector });
}

/** Apply a workspace mutation through the worker (the single writer). Single
 *  attempt by design (observe-don't-replay): a mutation whose response is lost
 *  must NOT be replayed; the UI reconciles by re-reading. */
export function mutateWorkspaceRemote(op: MutationOp): Promise<Response<MutationResult>> {
  return send({ kind: 'workspace.mutate', op });
}

/** Whether this platform's once-per-install history sweep has already run
 *  (chatgpt-history-backfill, D4). A failed/lost read answers `true` so a transport
 *  blip can never trigger a duplicate, user-visible sweep. */
export async function isHistoryBackfilled(platform: PlatformId): Promise<boolean> {
  const res = await queryWorkspaceRemote({ kind: 'platform.state', platform });
  if (!res?.ok) return true;
  const snapshot = res.data;
  if (snapshot.kind !== 'platform.state') return true;
  return snapshot.state?.historyBackfilledAt !== undefined;
}

/** Record that the sweep ran for this platform, and how it ended. */
export function recordHistoryBackfillRemote(
  platform: PlatformId,
  stoppedBy: 'plateau' | 'cap' | 'noop',
): Promise<Response<MutationResult>> {
  return mutateWorkspaceRemote({ op: 'platform.recordHistoryBackfill', platform, stoppedBy });
}
