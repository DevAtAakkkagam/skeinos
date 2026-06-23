// Starter-pack seeding from the Prompts empty state. Whenever the prompt library is
// empty, this affordance offers a professional-domain picker that installs that
// domain's bundled starter prompts via the controller's existing `installSeeds` path
// and records the chosen domain (reusing the onboarding gate's domain writer). It is
// shown on every empty state — onboarded or not — so there is always a one-click way
// to pre-load a starter library. Installing seeds fills the library, which dismisses
// the empty state hosting this control.

import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { DOMAIN_REGISTRY, type DomainId } from '../../shared/domains';
import { setOnboardingDomain } from '../onboarding/gate';
import { useT } from '../../core/i18n';
import type { PromptsController } from './usePromptsController';

export interface StarterSeedProps {
  controller: PromptsController;
  /** Test seam: override the domain-persist writer (defaults to the gate writer). */
  persistDomain?: (domain: DomainId) => void | Promise<void>;
}

export function StarterSeed({
  controller: c,
  persistDomain = setOnboardingDomain,
}: StarterSeedProps): JSX.Element {
  const t = useT();
  const [domain, setDomain] = useState<DomainId>(DOMAIN_REGISTRY[0].id);
  const [busy, setBusy] = useState(false);

  const seed = () => {
    if (busy) return;
    setBusy(true);
    // Install the picked domain's seeds (idempotent), then record the chosen domain.
    // The library re-read (inside installSeeds) surfaces the new rows, which dismisses
    // the empty state hosting this control.
    void Promise.resolve(c.installSeeds(domain))
      .then(() => persistDomain(domain))
      .catch(() => undefined)
      .finally(() => setBusy(false));
  };

  return (
    <div class="sk-prompts__seed" data-testid="sk-prompts-seed">
      <p class="sk-prompts__seed-label">{t('prompts.seedTitle')}</p>
      <div class="sk-prompts__seed-row">
        <label class="sk-prompts__seed-field" for="sk-prompts-seed-domain">
          <span class="sk-prompts__seed-field-label">{t('prompts.seedDomainLabel')}</span>
          <select
            id="sk-prompts-seed-domain"
            class="sk-select"
            data-testid="sk-prompts-seed-domain"
            value={domain}
            onChange={(e) => setDomain((e.currentTarget as HTMLSelectElement).value as DomainId)}
          >
            {DOMAIN_REGISTRY.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          class="sk-btn sk-btn--ghost"
          data-testid="sk-prompts-seed-add"
          disabled={busy}
          aria-busy={busy}
          onClick={seed}
        >
          {t('prompts.seedAdd')}
        </button>
      </div>
    </div>
  );
}
