// A single profile row — now structurally uniform with the conversation/prompt rows:
// the name + description are a non-interactive label (editing is reached through the
// row menu, not by clicking the row), the per-platform brand logos sit to its right,
// and an overflow (`⋯`) `Menu` revealed on row hover / keyboard focus carries the row
// actions (Edit / Delete) — the same
// affordance used everywhere else in the overlay (folders, conversations, prompts).
// A destructive delete is confirmed through a lightweight `Dialog` before it runs
// (PRIV: deletes are explicit and never lose work silently). Tokens only, ARIA-labelled.

import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import type { InstructionProfile } from '../../shared/types';
import { MoreIcon } from '../components/Icon';
import { PlatformLogo } from '../components/PlatformLogo';
import { SUPPORTED_PLATFORMS as TARGETABLE_PLATFORMS } from '../../shared/branding';
import { Dialog } from '../primitives/Dialog';
import { OverflowMenu } from '../prompts/OverflowMenu';
import { useT } from '../../core/i18n';

export interface ProfileRowProps {
  profile: InstructionProfile;
  onEdit: (p: InstructionProfile) => void;
  onDelete: (p: InstructionProfile) => void;
}

export function ProfileRow({ profile: p, onEdit, onDelete }: ProfileRowProps): JSX.Element {
  const t = useT();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const name = p.name || t('profiles.defaultName');
  // Only the targetable platforms this profile applies to draw a logo (stable order).
  const logos = TARGETABLE_PLATFORMS.filter((pl) => p.appliesTo.includes(pl));

  const onMenuSelect = (value: string): void => {
    if (value === 'edit') onEdit(p);
    else if (value === 'delete') setConfirmOpen(true);
  };

  return (
    <li class="sk-profiles__item">
      <div class="sk-profiles__row" data-testid={`sk-profile-row-${p.id}`}>
        <span class="sk-profiles__name" data-testid="sk-profile-row-name">
          {name}
        </span>
        {p.description ? <span class="sk-profiles__desc">{p.description}</span> : null}
      </div>

      {logos.length > 0 ? (
        <span class="sk-profiles__logos" aria-hidden="true">
          {logos.map((pl) => (
            <span key={pl} class="sk-profiles__logo">
              <PlatformLogo platform={pl} size={14} />
            </span>
          ))}
        </span>
      ) : null}

      <span class="sk-profiles__menu">
        <OverflowMenu
          trigger={<MoreIcon size={16} />}
          triggerClass="sk-icon-btn sk-row-menu"
          ariaLabel={t('profiles.rowMenu')}
          triggerTestId="sk-profile-row-menu"
          contentTestId="sk-profile-row-menu-content"
          onSelect={onMenuSelect}
          items={[
            { value: 'edit', label: t('profiles.edit'), testid: 'sk-profile-menu-edit' },
            { value: 'delete', label: t('profiles.delete'), testid: 'sk-profile-menu-delete' },
          ]}
        />
      </span>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        ariaLabel={t('profiles.confirmDeleteTitle')}
        contentTestId="sk-profile-row-delete-confirm"
      >
        <div class="sk-dialog__body">
          <h2 class="sk-dialog__title">{t('profiles.confirmDeleteTitle')}</h2>
          <p class="sk-text sk-text--muted">{t('profiles.confirmDeleteBody', { name })}</p>
          <div class="sk-dialog__actions">
            <button
              type="button"
              class="sk-btn sk-btn--ghost"
              data-testid="sk-profile-row-delete-cancel"
              onClick={() => setConfirmOpen(false)}
            >
              {t('profiles.cancel')}
            </button>
            <button
              type="button"
              class="sk-btn sk-btn--danger"
              data-testid="sk-profile-row-delete-confirm-btn"
              onClick={() => {
                setConfirmOpen(false);
                onDelete(p);
              }}
            >
              {t('profiles.confirmDelete')}
            </button>
          </div>
        </div>
      </Dialog>
    </li>
  );
}
