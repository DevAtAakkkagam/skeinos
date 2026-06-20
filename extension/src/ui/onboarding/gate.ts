// The first-run gate (onboarding-foundation, D-3). Thin helpers over the existing
// settings accessors — no new persistence API. The completion bit lives in
// `chrome.storage.local` (via `core/settings`), so it survives a panel reload and
// a service-worker restart ([SW] no memory-only state).

import { setSettings, type Settings } from '../../core/settings';

/** True once the user has finished first-run onboarding. */
export function isOnboardingComplete(settings: Settings): boolean {
  return settings.onboardingCompleted === true;
}

/**
 * Mark onboarding complete. Writes `onboardingCompleted: true` through the
 * existing settings writer, which broadcasts via `chrome.storage.onChanged` so a
 * subscribed panel re-scopes live (D-3).
 */
export async function completeOnboarding(): Promise<void> {
  await setSettings({ onboardingCompleted: true });
}
