// Content/UI-side instruction-profile client. Imports only `send`/`sendWithRetry` +
// the payload types, never the store — so the sidebar bundle stays free of IndexedDB
// code. The request-kind contracts are declared in `handlers.ts`; declaration merging
// is global, so these `send` calls are fully typed here without importing the worker
// module. The `Remote` suffix mirrors `core/prompts`' client and avoids colliding with
// the worker-side `queryProfileLibrary`/`mutateProfileLibrary` (which take a `store`).

import { send, sendWithRetry } from '../messaging';
import type {
  MutationResult,
  ProfileInstallResult,
  ProfileMutationOp,
  ProfileSelector,
  ProfileSnapshot,
} from '../../shared/profiles';
import type { DomainId } from '../../shared/domains';
import type { Response } from '../../shared/messages';

/** Run a profile-library read against the worker. Reads are idempotent, so they opt
 *  into transient-transport retry — a cold/waking worker recovers transparently. */
export function queryProfilesRemote(selector: ProfileSelector): Promise<Response<ProfileSnapshot>> {
  return sendWithRetry({ kind: 'profiles.query', selector });
}

/** Apply a profile-library mutation through the worker (the single writer). Single
 *  attempt by design (observe-don't-replay): a mutation whose response is lost must
 *  NOT be replayed; the UI reconciles by re-reading on the next `state.changed`. */
export function mutateProfilesRemote(op: ProfileMutationOp): Promise<Response<MutationResult>> {
  return send({ kind: 'profiles.mutate', op });
}

/** Install a domain's starter profiles through the worker (the single writer). The
 *  install is idempotent on the worker side (dedupe by `seedId`), so it opts into
 *  transient-transport retry — a lost ack simply re-runs a no-op that inserts 0. */
export function installProfileSeedsRemote(
  domain: DomainId,
): Promise<Response<ProfileInstallResult>> {
  return sendWithRetry({ kind: 'profiles.install', domain });
}
