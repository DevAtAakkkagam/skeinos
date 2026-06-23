// Health reporting rides the messaging *request seam* (design D-R2): a content
// script reports its `selfCheck()` result to the worker, which persists it and —
// on failure — fans out the EXISTING `platform.degraded` broadcast. Two request
// kinds are added by declaration-merging `RequestContracts`; the hub and the
// `messaging` spec are untouched. Worker → tab keeps using the already-enumerated
// `platform.degraded` broadcast, so no new broadcast kind is introduced either.

import type { PlatformId } from '../../shared/types';
import { broadcast, registerHandler, send } from '../../core/messaging';
import { recordEvent } from '../../core/observability';
import { ANCHOR_KEYS, type AnchorKey } from '../../core/observability/taxonomy';
import type { SelfCheckResult } from '../types';
import { clearHealth, getDegraded, getPlatformHealth, setHealth } from './health';

declare module '../../shared/messages' {
  interface RequestContracts {
    'platform.report-health': {
      request: { platform: PlatformId; result: SelfCheckResult; configVer?: string };
      response: { ok: true };
    };
    'platform.query-health': {
      request: Record<string, unknown>;
      response: { degraded: PlatformId[] };
    };
  }
}

/** Content/UI side: report a platform's `selfCheck()` result to the worker. The
 *  config version rides along so the worker's diagnostics events can pin breakage
 *  to a specific selector config (adapter-resilience spec). */
export async function reportHealth(
  platform: PlatformId,
  result: SelfCheckResult,
  configVer?: string,
): Promise<void> {
  await send({ kind: 'platform.report-health', platform, result, configVer });
}

/** Coerce a selector key to the fixed anchor enum (never a raw selector). */
function toAnchorKey(key: string): AnchorKey {
  return (ANCHOR_KEYS as readonly string[]).includes(key) ? (key as AnchorKey) : 'unknown';
}

/** A diagnostics-safe version string (the validator requires a dotted version). */
function safeVer(configVer?: string): string {
  return configVer && /^\d+(?:\.\d+)*$/.test(configVer) ? configVer : '0';
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
    const configVer = safeVer(req.configVer);
    if (req.result.ok) {
      // Recovery diagnostics (task 6.5): emit only on a real transition back to
      // healthy (the platform was degraded), so a steady-state pass is not reported.
      const prev = await getPlatformHealth(req.platform);
      await clearHealth(req.platform);
      if (!prev.ok) {
        await recordEvent({
          name: 'adapter_recovered',
          props: { platform: req.platform, configVer },
        });
      }
    } else {
      await setHealth(req.platform, req.result);
      await broadcast({ kind: 'platform.degraded', platform: req.platform });
      // selfCheck-failure diagnostics: one id-less event per missing anchor (the
      // hot-fix signal), with the anchor as a fixed enum value — never a selector.
      const anchors = req.result.missing.length > 0 ? req.result.missing : ['unknown'];
      for (const anchor of anchors) {
        await recordEvent({
          name: 'adapter_selfcheck_failed',
          props: { platform: req.platform, configVer, anchorKey: toAnchorKey(anchor) },
        });
      }
    }
    return { ok: true };
  });

  registerHandler('platform.query-health', async () => {
    return { degraded: await getDegraded() };
  });
}
