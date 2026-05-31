// When an adapter's self-check fails, the content script must surface it as a
// `platform.degraded` broadcast — but only the service worker broadcasts (the
// single-writer spine). So the content side `send`s a request and the worker
// fans out the existing `platform.degraded` broadcast. The request kind is added
// through the messaging seam (declaration merging), never by editing the hub.

import type { PlatformId } from '../../shared/types';
import { broadcast, registerHandler, send } from '../../core/messaging';

declare module '../../shared/messages' {
  interface RequestContracts {
    'platform.report-degraded': {
      request: { platform: PlatformId };
      response: { ok: true };
    };
  }
}

/** Content/UI side: ask the worker to broadcast that a platform degraded. */
export async function reportDegraded(platform: PlatformId): Promise<void> {
  await send({ kind: 'platform.report-degraded', platform });
}

/** Worker side: register the handler that fans out the `platform.degraded` broadcast. */
export function registerAdapterHandlers(): void {
  registerHandler('platform.report-degraded', async (req) => {
    await broadcast({ kind: 'platform.degraded', platform: req.platform });
    return { ok: true };
  });
}
