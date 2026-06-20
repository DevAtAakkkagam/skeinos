// The first-run welcome surface (onboarding-foundation, D-5). This slice ships the
// welcome screen — brand hero, the two privacy assurances (local-first + metadata-
// only), and the footer CTA that closes the gate. The remaining D17 steps (host-
// permission priming, domain picker, first-action CTA) land in `onboarding-flow`
// behind the same mount point and gate contract; the step dots are a static
// placeholder for that flow (welcome = step 1 of 4).

import { useState } from 'preact/hooks';
import { BrandGlyph } from '../components/BrandGlyph';
import { ChevronIcon, LockIcon, ShieldIcon } from '../components/Icon';
import { completeOnboarding } from './gate';

// i18n-ready strings (PREACT: no hard-coded user-facing literals in markup).
const STR = {
  eyebrow: 'Welcome to Skeinos',
  title: 'One workspace across every AI chat',
  body: 'Folders, search, prompts and instruction profiles that follow you across Claude, Gemini, Perplexity and more — laid over the sites you already use.',
  localTitle: 'Local-first by design',
  localBody:
    'Your conversations are read and indexed on your device. Message content never reaches our servers.',
  syncTitle: 'Only metadata syncs',
  syncBody:
    'Folders, prompts and tags sync end-to-end encrypted. Nothing else leaves your machine.',
  haveAccount: 'I already have an account',
  cta: 'Get started',
  stepsLabel: 'Step 1 of 4',
} as const;

const STEP_COUNT = 4;

export interface OnboardingSurfaceProps {
  /** Override the completion writer (tests). Defaults to the real gate writer. */
  onComplete?: () => void | Promise<void>;
}

export function OnboardingSurface({ onComplete = completeOnboarding }: OnboardingSurfaceProps) {
  const [busy, setBusy] = useState(false);

  // Both footer affordances close the gate in this slice: "Get started" advances,
  // and "I already have an account" skips the intro (real sign-in lands with the
  // sync tier). The settings write broadcasts via storage.onChanged, so the
  // subscribed panel re-scopes out of onboarding — no reload, no local state here.
  const finish = () => {
    if (busy) return;
    setBusy(true);
    void Promise.resolve(onComplete()).catch(() => setBusy(false));
  };

  return (
    <div class="sk-shell sk-onb" data-testid="sk-onboarding">
      <div class="sk-onb__scroll">
        <div class="sk-onb__hero">
          <span class="sk-onb__glyph" aria-hidden="true">
            <BrandGlyph size={22} />
          </span>
          <p class="sk-onb__eyebrow">{STR.eyebrow}</p>
          <h1 class="sk-onb__title">{STR.title}</h1>
          <p class="sk-onb__body">{STR.body}</p>
        </div>

        <ul class="sk-onb__features">
          <li class="sk-onb__feature">
            <span class="sk-onb__feature-icon" aria-hidden="true">
              <ShieldIcon size={18} />
            </span>
            <div class="sk-onb__feature-text">
              <p class="sk-onb__feature-title">{STR.localTitle}</p>
              <p class="sk-onb__feature-body">{STR.localBody}</p>
            </div>
          </li>
          <li class="sk-onb__feature">
            <span class="sk-onb__feature-icon" aria-hidden="true">
              <LockIcon size={18} />
            </span>
            <div class="sk-onb__feature-text">
              <p class="sk-onb__feature-title">{STR.syncTitle}</p>
              <p class="sk-onb__feature-body">{STR.syncBody}</p>
            </div>
          </li>
        </ul>

        <div class="sk-onb__dots" role="img" aria-label={STR.stepsLabel}>
          {Array.from({ length: STEP_COUNT }, (_, i) => (
            <span class={`sk-onb__dot${i === 0 ? ' sk-onb__dot--active' : ''}`} />
          ))}
        </div>
      </div>

      <div class="sk-shell__footer sk-onb__footer">
        <button type="button" class="sk-btn--link" onClick={finish} disabled={busy}>
          {STR.haveAccount}
        </button>
        <button
          type="button"
          class="sk-btn sk-btn--icon"
          data-testid="sk-onboarding-start"
          onClick={finish}
          disabled={busy}
        >
          {STR.cta}
          <ChevronIcon size={16} />
        </button>
      </div>
    </div>
  );
}
