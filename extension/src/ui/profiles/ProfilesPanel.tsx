// The Profiles tab body — structurally uniform with the Prompts body (`PromptsPanel`):
// a `PROFILES` section header (reusing `.sk-sidebar__section-head`) whose right-aligned
// `+` is the create action, a 1-up list of profile rows, and the loading / error /
// first-run states. Each row (see `ProfileRow`) is click-to-edit and carries the same
// overflow (`⋯`) actions menu used everywhere else in the overlay; clicking a row or
// Edit opens the editor MODAL (the same `Dialog` style as Prompts/Folders).
//
// It is a pure view over a {@link ProfilesController}: the controller (held once at the
// shell) owns the library, the editor state, and every mutation. CRUD + view only this
// slice — a profile created here changes no chat; the per-platform mode is PREPEND-only
// (D-3 / D13).

import type { JSX } from 'preact';
import { PlusIcon, PromptIcon } from '../components/Icon';
import { ProfileEditor } from './ProfileEditor';
import { ProfileRow } from './ProfileRow';
import { StarterKitBand } from '../starter/StarterKitBand';
import { useT } from '../../core/i18n';
import type { ProfilesController } from './useProfilesController';

export interface ProfilesPanelProps {
  controller: ProfilesController;
}

export function ProfilesPanel({ controller: c }: ProfilesPanelProps): JSX.Element {
  const t = useT();
  return (
    <div class="sk-profiles" data-testid="sk-profiles-panel" role="tabpanel" aria-label={t('profiles.panelLabel')}>
      <div class="sk-profiles__scroll" data-testid="sk-profiles-scroll">
        <div class="sk-sidebar__section">
          <div class="sk-row sk-sidebar__section-head">
            <span class="sk-sidebar__heading">{t('profiles.sectionTitle')}</span>
            <button
              class="sk-icon-btn sk-icon-btn--accent"
              type="button"
              data-testid="sk-profile-new"
              aria-label={t('profiles.newProfile')}
              title={t('profiles.newProfile')}
              onClick={c.openCreate}
            >
              <PlusIcon size={16} />
            </button>
          </div>

          {/* Provenance band: names the kit these profiles came from, says they are
              editable, and hosts the swap entry. Null (hidden) once every seed has
              graduated or been deleted. */}
          {c.kit ? <StarterKitBand kit={c.kit} kind="profiles" /> : null}

          {c.status === 'loading' ? (
            <div class="sk-empty" data-testid="sk-profiles-loading" role="status" aria-live="polite">
              <span class="sk-spinner" aria-hidden="true" />
              <p class="sk-empty__body">{t('profiles.loading')}</p>
            </div>
          ) : c.status === 'error' ? (
            <div class="sk-empty" data-testid="sk-profiles-error" role="alert">
              <span class="sk-empty__icon" aria-hidden="true">
                <PromptIcon size={40} />
              </span>
              <p class="sk-empty__title">{t('profiles.errorTitle')}</p>
              <p class="sk-empty__body">{t('profiles.errorBody')}</p>
              <button type="button" class="sk-btn sk-btn--icon" data-testid="sk-profiles-retry" onClick={c.retry}>
                {t('profiles.retry')}
              </button>
            </div>
          ) : c.profiles.length === 0 ? (
            <div class="sk-empty" data-testid="sk-profiles-empty-first-run">
              <span class="sk-empty__icon" aria-hidden="true">
                <PromptIcon size={40} />
              </span>
              <p class="sk-empty__title">{t('profiles.firstRunTitle')}</p>
              <p class="sk-empty__body">{t('profiles.firstRunBody')}</p>
              <button type="button" class="sk-btn sk-btn--icon" data-testid="sk-profiles-create-first" onClick={c.openCreate}>
                <PlusIcon size={16} />
                {t('profiles.newProfile')}
              </button>
            </div>
          ) : (
            <ul class="sk-profiles__list" data-testid="sk-profiles-list">
              {c.profiles.map((p) => (
                <ProfileRow key={p.id} profile={p} onEdit={c.openEdit} onDelete={c.deleteProfile} />
              ))}
            </ul>
          )}
        </div>
      </div>

      {c.editorOpen ? (
        <ProfileEditor
          // Remount per target so the form reinitializes from the edited profile.
          key={c.editing?.id ?? 'new'}
          open={c.editorOpen}
          profile={c.editing}
          onClose={c.closeEditor}
          onSubmit={c.submitProfile}
          onDelete={c.deleteProfile}
          quota={c.createQuota}
        />
      ) : null}
    </div>
  );
}
