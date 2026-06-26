// Starter-kit swap orchestration (starter-kit-provenance). The provenance band's
// "Change" action runs this: it replaces the user's current starter kit with another
// one, across BOTH the prompt and profile libraries (a kit seeds both — see
// onboarding's `defaultInstallSeeds`), keeping the single-kit-at-a-time model.
//
// "Replace" is honest about data loss: it clears only the OLD kit's untouched seeds
// (records still tagged with the old `domain`). Anything the user edited or created
// already shed its `domain` (the update handlers strip it), so personal work is never
// removed. Installing the new kit is idempotent (dedupe by `seedId`).
//
// Pure orchestration over the remote clients + the settings writer — no store import,
// so the sidebar bundle stays free of IndexedDB code. Each remote write broadcasts
// `state.changed`, so the open libraries reconcile themselves; this resolves once the
// writes are acknowledged.

import type { DomainId } from '../../shared/domains';
import { installPromptSeedsRemote, mutatePromptLibraryRemote } from '../../core/prompts';
import { installProfileSeedsRemote, mutateProfilesRemote } from '../../core/profiles';
import { setOnboardingDomain } from '../onboarding/gate';

/** Swap the active starter kit from `from` (the current kit, or `null` when none) to
 *  `to`. Clears the old kit's untouched seeds, installs the new kit into both
 *  libraries, then records the pick in `Settings.domain`. Re-picking the same kit
 *  (`from === to`) skips the clear and just re-installs (an idempotent no-op that
 *  restores any starter items the user deleted but never edited). A failed profile
 *  install never blocks the prompt-driven flow (mirrors onboarding). */
export async function swapStarterKit(from: DomainId | null, to: DomainId): Promise<void> {
  if (from && from !== to) {
    await mutatePromptLibraryRemote({ op: 'prompt.clearDomain', domain: from });
    await mutateProfilesRemote({ op: 'profile.clearDomain', domain: from });
  }
  await Promise.all([
    installPromptSeedsRemote(to),
    installProfileSeedsRemote(to).catch(() => undefined),
  ]);
  await setOnboardingDomain(to);
}
