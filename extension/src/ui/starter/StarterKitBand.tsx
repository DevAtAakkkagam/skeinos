// The starter-kit provenance band (starter-kit-provenance). A compact row shown under
// the Prompts / Profiles section header whenever the tab still holds untouched starter
// seeds: it names the kit the items came from, states once that they are fully
// editable, and hosts the only post-onboarding entry point to swap the kit.
//
// It renders only when the panel passes a non-null `kit` (derived from records still
// carrying a `domain`), so it self-empties: as the user edits seeds — which strips
// their `domain` (they become "theirs") — the count falls and the band disappears
// when the last seed graduates or is deleted. Tokens only, ARIA-labelled, no per-card
// clutter (the cost is paid once at the section level, not on every row).

import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { DOMAIN_REGISTRY, type DomainId } from '../../shared/domains';
import { Dialog } from '../primitives/Dialog';
import { useT } from '../../core/i18n';
import { swapStarterKit } from './swap';

/** The active kit on a tab: its domain and how many untouched seeds remain. */
export interface StarterKitInfo {
  domain: DomainId;
  count: number;
}

export interface StarterKitBandProps {
  /** The active kit (the panel renders the band only when this is non-null). */
  kit: StarterKitInfo;
  /** Which library this band sits in — selects the caption's noun/plural. */
  kind: 'prompts' | 'profiles';
  /** Swap implementation. Injectable for tests; defaults to the live orchestrator. */
  swap?: (from: DomainId | null, to: DomainId) => Promise<void>;
}

/** A domain's display label (falls back to its id, which never ships to users). */
function labelOf(domain: DomainId): string {
  return DOMAIN_REGISTRY.find((d) => d.id === domain)?.label ?? domain;
}

export function StarterKitBand({ kit, kind, swap = swapStarterKit }: StarterKitBandProps): JSX.Element {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<DomainId>(kit.domain);
  const [busy, setBusy] = useState(false);

  const captionKey = kind === 'prompts' ? 'starterKit.captionPrompts' : 'starterKit.captionProfiles';

  const close = (): void => {
    if (busy) return;
    setOpen(false);
    setChoice(kit.domain);
  };

  const replace = (): void => {
    if (busy || choice === kit.domain) return;
    setBusy(true);
    void Promise.resolve(swap(kit.domain, choice))
      .then(() => {
        setBusy(false);
        setOpen(false);
      })
      .catch(() => setBusy(false));
  };

  return (
    <div class="sk-starter-kit" data-testid="sk-starter-kit">
      <span class="sk-starter-kit__dot" aria-hidden="true" />
      <div class="sk-starter-kit__text">
        <span class="sk-starter-kit__label" data-testid="sk-starter-kit-label">
          {t('starterKit.label', { name: labelOf(kit.domain) })}
        </span>
        <span class="sk-starter-kit__caption">{t(captionKey, { count: kit.count })}</span>
      </div>
      <button
        type="button"
        class="sk-starter-kit__change"
        data-testid="sk-starter-kit-change"
        aria-label={t('starterKit.changeAria')}
        onClick={() => setOpen(true)}
      >
        {t('starterKit.change')}
      </button>

      <Dialog
        open={open}
        onClose={close}
        ariaLabel={t('starterKit.dialogTitle')}
        contentTestId="sk-starter-kit-dialog"
      >
        <div class="sk-dialog__body">
          <h2 class="sk-dialog__title">{t('starterKit.dialogTitle')}</h2>
          <p class="sk-text sk-text--muted">{t('starterKit.dialogBody')}</p>
          <label class="sk-field__label" for="sk-starter-kit-select">
            {t('starterKit.dialogPick')}
          </label>
          <select
            id="sk-starter-kit-select"
            class="sk-select"
            data-testid="sk-starter-kit-select"
            value={choice}
            disabled={busy}
            onChange={(e) => setChoice((e.currentTarget as HTMLSelectElement).value as DomainId)}
          >
            {DOMAIN_REGISTRY.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
          <div class="sk-dialog__actions">
            <button
              type="button"
              class="sk-btn sk-btn--ghost"
              data-testid="sk-starter-kit-cancel"
              disabled={busy}
              onClick={close}
            >
              {t('starterKit.cancel')}
            </button>
            <button
              type="button"
              class="sk-btn sk-btn--icon"
              data-testid="sk-starter-kit-replace"
              disabled={busy || choice === kit.domain}
              aria-busy={busy}
              onClick={replace}
            >
              {busy ? t('starterKit.replacing') : t('starterKit.replace')}
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
