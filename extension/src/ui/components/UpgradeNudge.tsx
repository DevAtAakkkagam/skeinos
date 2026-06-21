// The block-with-nudge surface (tier-gate, spec "Block-with-nudge preserves user
// input" / [PRIV]). Shown inside a create surface when the worker rejects a create
// with `quota_exceeded`: it names the reached free-tier limit and that Pro raises
// it later. Informational ONLY — no checkout/purchase action exists until billing
// ships (M5). Reuses the `.sk-nudge` style pattern; renders nothing destructive, so
// the caller's draft stays intact by construction.

import type { JSX } from 'preact';
import { TIER_LIMITS, type Resource } from '../../core/tier';

/** Centralized, i18n-ready nudge copy (task 3.5). Numbers are NOT hard-coded — the
 *  body interpolates the limit derived from {@link TIER_LIMITS}, so worker
 *  enforcement and this copy can never disagree. Per-resource noun keeps the
 *  sentence natural without fragment concatenation. */
const STR = {
  /** The user-facing noun for each quota-governed resource. */
  resourceNoun: {
    folders: 'folders',
    prompts: 'prompts',
    profiles: 'profiles',
    tags: 'tags',
  } as Record<Resource, string>,
  /** The informational sentence; `limit`/`noun` are interpolated (no checkout). */
  body: (noun: string, limit: number): string =>
    `You've reached the free plan's limit of ${limit} ${noun}. Your existing ${noun} are untouched — remove one to make room, or upgrade to Skeinos Pro (coming soon) for unlimited ${noun}.`,
} as const;

export interface UpgradeNudgeProps {
  /** Which quota was reached — selects the noun and the displayed limit. */
  resource: Resource;
  /** The limit to display; defaults to the FREE limit for `resource`. Pass the
   *  error detail's `limit` to stay exact if the table ever diverges per tier. */
  limit?: number;
  /** Override the test id (defaults to a resource-scoped id). */
  testId?: string;
}

export function UpgradeNudge({ resource, limit, testId }: UpgradeNudgeProps): JSX.Element {
  const noun = STR.resourceNoun[resource];
  const shown = limit ?? TIER_LIMITS.FREE[resource];
  return (
    <div
      class="sk-nudge sk-nudge--upgrade"
      role="status"
      data-testid={testId ?? `sk-upgrade-nudge-${resource}`}
      data-resource={resource}
    >
      <span class="sk-nudge__text">{STR.body(noun, shown)}</span>
    </div>
  );
}
