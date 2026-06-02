// Content/UI-side folder client. Imports only `send` + the payload types, never
// the store — so the sidebar bundle stays free of IndexedDB code. The request-kind
// contracts are declared in `handlers.ts`; declaration merging is global, so these
// `send` calls are fully typed here without importing the worker module.

import { send } from '../messaging';
import type {
  MutationOp,
  MutationResult,
  WorkspaceSelector,
  WorkspaceSnapshot,
} from '../../shared/workspace';
import type { Response } from '../../shared/messages';

/** Run a workspace read against the worker. */
export function queryWorkspaceRemote(
  selector: WorkspaceSelector,
): Promise<Response<WorkspaceSnapshot>> {
  return send({ kind: 'workspace.query', selector });
}

/** Apply a workspace mutation through the worker (the single writer). */
export function mutateWorkspaceRemote(op: MutationOp): Promise<Response<MutationResult>> {
  return send({ kind: 'workspace.mutate', op });
}
