// core/tier — the monetization tier's quota table and enforcement guard. Pure
// domain logic (no DOM/storage/messaging): the worker imports `assertWithinQuota`
// to gate create handlers, and the UI imports `TIER_LIMITS` / `QUOTA_EXCEEDED`
// for its block-with-nudge copy. The single source of the tier numbers (D1).

export {
  RESOURCES,
  TIER_LIMITS,
  QUOTA_EXCEEDED,
  QuotaError,
  assertWithinQuota,
  quotaDetailOf,
  type Tier,
  type Resource,
  type QuotaErrorDetail,
} from './limits';
