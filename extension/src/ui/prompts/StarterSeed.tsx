// Starter-pack seeding from the Prompts empty state (recovery path for users who
// skipped onboarding's domain pick). Onboarding normally owns seeding, but a user who
// chose "I already have an account" — or finished without picking a domain — lands
// with an empty library and no domain set, and otherwise has no way to seed the
// bundled starter prompts. This affordance fills that gap: it appears ONLY while
// `Settings.domain` is unset (so an onboarded/seeded user never sees it), lets the
// user pick a professional domain, installs that domain's seeds via the controller's
// existing `installSeeds` path, and persists the chosen domain (so it does not
// reappear). Reuses the onboarding gate's domain writer — same seam, same effect.

import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { DOMAIN_REGISTRY, type DomainId } from '../../shared/domains';
import { getSettings, subscribeSettings } from '../../core/settings';
import { setOnboardingDomain } from '../onboarding/gate';
import { STR } from './strings';
import type { PromptsController } from './usePromptsController';

export interface StarterSeedProps {
  controller: PromptsController;
  /** Test seam: override the resolved "has a domain been chosen?" state. */
  domainChosen?: boolean;
  /** Test seam: override the domain-persist writer (defaults to the gate writer). */
  persistDomain?: (domain: DomainId) => void | Promise<void>;
}

export function StarterSeed({
  controller: c,
  domainChosen,
  persistDomain = setOnboardingDomain,
}: StarterSeedProps): JSX.Element | null {
  // `undefined` = settings not yet resolved → render nothing (no flash); `true` =
  // a domain was chosen (onboarded) → stay hidden; `false` = no domain → offer it.
  const [chosen, setChosen] = useState<boolean | undefined>(domainChosen);
  const [domain, setDomain] = useState<DomainId>(DOMAIN_REGISTRY[0].id);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // When the test seam pins the state, skip the live settings read entirely.
    if (domainChosen !== undefined) {
      setChosen(domainChosen);
      return;
    }
    let live = true;
    void getSettings().then((s) => {
      if (live) setChosen(s.domain != null);
    });
    const dispose = subscribeSettings((s) => {
      if (live) setChosen(s.domain != null);
    });
    return () => {
      live = false;
      dispose();
    };
  }, [domainChosen]);

  // Unresolved or already-chosen → render nothing.
  if (chosen !== false) return null;

  const seed = () => {
    if (busy) return;
    setBusy(true);
    // Install the picked domain's seeds (idempotent), then persist the domain so this
    // affordance retires. The library re-read (inside installSeeds) surfaces the new
    // rows, which also dismisses the empty state hosting this control.
    void Promise.resolve(c.installSeeds(domain))
      .then(() => persistDomain(domain))
      .catch(() => undefined)
      .finally(() => setBusy(false));
  };

  return (
    <div class="sk-prompts__seed" data-testid="sk-prompts-seed">
      <p class="sk-prompts__seed-label">{STR.seedTitle}</p>
      <div class="sk-prompts__seed-row">
        <label class="sk-prompts__seed-field" for="sk-prompts-seed-domain">
          <span class="sk-prompts__seed-field-label">{STR.seedDomainLabel}</span>
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
          {STR.seedAdd}
        </button>
      </div>
    </div>
  );
}
