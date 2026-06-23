// The block-with-nudge surface (tier-gate, spec "Block-with-nudge preserves user
// input" / [PRIV]). Shown inside a create surface when the worker rejects a create
// with `quota_exceeded`: it names the reached free-tier limit and that Pro raises
// it later. Informational ONLY — no checkout/purchase action exists until billing
// ships (M5). Reuses the `.sk-nudge` style pattern; renders nothing destructive, so
// the caller's draft stays intact by construction.

import type { JSX } from 'preact';
import { TIER_LIMITS, type Resource } from '../../core/tier';
import { useT } from '../../core/i18n';

/** Maps each quota-governed resource to its catalog noun key, keeping the sentence
 *  natural without fragment concatenation. */
const NOUN_KEY = {
  folders: 'nudge.nounFolders',
  prompts: 'nudge.nounPrompts',
  profiles: 'nudge.nounProfiles',
  tags: 'nudge.nounTags',
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
  const t = useT();
  const noun = t(NOUN_KEY[resource]);
  const shown = limit ?? TIER_LIMITS.FREE[resource];

  return (
    <div
      class="sk-nudge sk-nudge--upgrade"
      role="status"
      data-testid={testId ?? `sk-upgrade-nudge-${resource}`}
      data-resource={resource}
    >
      <span class="sk-nudge__text">{t('nudge.body', { limit: shown, noun })}</span>
    </div>
  );
}
