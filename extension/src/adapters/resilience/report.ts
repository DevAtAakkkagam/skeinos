// Health reporting rides the messaging *request seam* (design D-R2): a content
// script reports its `selfCheck()` result to the worker, which persists it and —
// on failure — fans out the EXISTING `platform.degraded` broadcast. Two request
// kinds are added by declaration-merging `RequestContracts`; the hub and the
// `messaging` spec are untouched. Worker → tab keeps using the already-enumerated
// `platform.degraded` broadcast, so no new broadcast kind is introduced either.

import type { PlatformId } from '../../shared/types';
import { broadcast, registerHandler, send } from '../../core/messaging';
import type { SelfCheckResult } from '../types';
import { clearHealth, getDegraded, setHealth } from './health';

declare module '../../shared/messages' {
  interface RequestContracts {
    'platform.report-health': {
      request: { platform: PlatformId; result: SelfCheckResult };
      response: { ok: true };
    };
    'platform.query-health': {
      request: Record<string, unknown>;
      response: { degraded: PlatformId[] };
    };
  }
}

/** Content/UI side: report a platform's `selfCheck()` result to the worker. */
export async function reportHealth(platform: PlatformId, result: SelfCheckResult): Promise<void> {
  await send({ kind: 'platform.report-health', platform, result });
}

/** Content/UI side: ask the worker which platforms are currently degraded. */
export async function queryHealth(): Promise<PlatformId[]> {
  const res = await send({ kind: 'platform.query-health' });
  return res.ok ? res.data.degraded : [];
}

/**
 * Worker side: register the health-report and health-query handlers. A failing
 * report persists the platform as degraded (arming its hot-fix flag) and broadcasts
 * `platform.degraded`; a passing report clears the degraded state and the flag.
 */
export function registerResilienceHandlers(): void {
  registerHandler('platform.report-health', async (req) => {
    if (req.result.ok) {
      await clearHealth(req.platform);
    } else {
      await setHealth(req.platform, req.result);
      await broadcast({ kind: 'platform.degraded', platform: req.platform });
    }
    return { ok: true };
  });

  registerHandler('platform.query-health', async () => {
    return { degraded: await getDegraded() };
  });
}
