// The first-run gate (onboarding-foundation, D-3). Thin helpers over the existing
// settings accessors — no new persistence API. The completion bit lives in
// `chrome.storage.local` (via `core/settings`), so it survives a panel reload and
// a service-worker restart ([SW] no memory-only state).

import { setSettings, type Settings } from '../../core/settings';
import type { DomainId } from '../../shared/domains';

/** True once the user has finished first-run onboarding. */
export function isOnboardingComplete(settings: Settings): boolean {
  return settings.onboardingCompleted === true;
}

/**
 * Persist the professional domain the user picked on the starter-library step
 * (onboarding-flow, D-4). Writes `Settings.domain` through the same settings
 * writer as {@link completeOnboarding} — it does NOT complete the gate (the
 * domain pick is an intermediate step; completion happens only at the terminal
 * actions, D-2).
 */
export async function setOnboardingDomain(domain: DomainId): Promise<void> {
  await setSettings({ domain });
}

/**
 * Mark onboarding complete. Writes `onboardingCompleted: true` through the
 * existing settings writer, which broadcasts via `chrome.storage.onChanged` so a
 * subscribed panel re-scopes live (D-3).
 */
export async function completeOnboarding(): Promise<void> {
  await setSettings({ onboardingCompleted: true });
}
