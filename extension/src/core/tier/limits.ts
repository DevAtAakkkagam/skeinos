// The single source of truth for tier quotas (tier-gate, design D1). The worker
// enforces against `TIER_LIMITS` and the UI imports the SAME numbers for its
// nudge copy, so the two can never drift. Pure module: no DOM, no storage, no
// messaging — just the table, the typed error, and the guard. The `Tier` type
// itself lives in `shared/settings` (dependency-free) and is re-exported here so
// callers have one tier import surface.

import type { Tier } from '../../shared/settings';

export type { Tier };

/** The quota-governed resources. `tags` is defined now but enforced by
 *  C7 (no tag-create handler exists yet — see that change's design). */
export type Resource = 'folders' | 'prompts' | 'profiles' | 'tags';

/** Every quota-governed resource, for iteration in tests and UI copy tables. */
export const RESOURCES: readonly Resource[] = ['folders', 'prompts', 'profiles', 'tags'];

/**
 * Per-tier maximum count per resource. `FREE` caps each resource; `PRO`
 * is `Infinity` (unlimited). This is the ONE place the numbers live — worker
 * enforcement and UI copy both read from here (D1).
 */
export const TIER_LIMITS: Record<Tier, Record<Resource, number>> = {
  FREE: { folders: 5, prompts: 25, profiles: 3, tags: 10 },
  PRO: { folders: Infinity, prompts: Infinity, profiles: Infinity, tags: Infinity },
};

/** The stable machine token a quota rejection carries across the messaging
 *  boundary; the UI switches on this single code for every resource (D4). */
export const QUOTA_EXCEEDED = 'quota_exceeded';

/** The structured context a {@link QuotaError} carries: which resource was at its
 *  cap, the current count, and the applicable limit. Rides the `AppError.detail`. */
export interface QuotaErrorDetail {
  resource: Resource;
  count: number;
  limit: number;
}

/**
 * A domain error thrown by the worker when a quota-governed create is refused.
 * Carries the stable `quota_exceeded` code and a structured `detail` so the
 * `toAppError` envelope preserves both across the messaging boundary and the UI
 * can pick its copy from `detail.resource` / `detail.limit`.
 */
export class QuotaError extends Error {
  code = QUOTA_EXCEEDED;
  detail: QuotaErrorDetail;
  constructor(detail: QuotaErrorDetail) {
    super(`Quota exceeded for ${detail.resource}: ${detail.count}/${detail.limit}`);
    this.name = 'QuotaError';
    this.detail = detail;
  }
}

/**
 * Reject a create when `currentCount` is at or above the tier's limit for
 * `resource`. Pure and side-effect-free: throws {@link QuotaError} or returns
 * void. A no-op for `PRO` (and any non-finite limit), so unlimited tiers never
 * reject. Callers pass the live count from the store's `query()` — never a cache.
 */
export function assertWithinQuota(resource: Resource, currentCount: number, tier: Tier): void {
  const limit = TIER_LIMITS[tier][resource];
  if (!Number.isFinite(limit)) return; // PRO / unlimited — never rejected
  if (currentCount >= limit) {
    throw new QuotaError({ resource, count: currentCount, limit });
  }
}

/**
 * Read the structured quota detail out of an error envelope, or `null` when the
 * error is absent or not a `quota_exceeded`. Lets a UI create flow branch on a
 * refused-for-quota result (`if (quotaDetailOf(res.error))`) and pick its nudge
 * copy from the returned `{ resource, limit }` without re-deriving the code.
 */
export function quotaDetailOf(
  error: { code?: string; detail?: unknown } | undefined,
): QuotaErrorDetail | null {
  if (!error || error.code !== QUOTA_EXCEEDED) return null;
  const d = error.detail as Partial<QuotaErrorDetail> | undefined;
  return d && typeof d.resource === 'string' ? (d as QuotaErrorDetail) : null;
}
