// The Prompts tab body — now structurally uniform with the Folders body (`Sidebar`):
// a `PROMPTS` section header (reusing `.sk-sidebar__section-head`) whose right-aligned
// `+` is the create action, the 1-up card list, and the loading / error / first-run /
// no-match states (each with a glyph, like the folder empty state). The category/tag
// filter row lives in the shell's filter slot (`PromptCategoryChips`) — the prompt
// analog of the platform chips — so both tabs share one filter affordance.
//
// It is a pure view over a {@link PromptsController}: the controller (held once at the
// shell, like `useWorkspace`) owns the library, the ephemeral filter selection, and
// every mutation, so the chip row and this body can never diverge.

import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { PlusIcon, PromptIcon } from '../components/Icon';
import { DOMAIN_REGISTRY, type DomainId } from '../../shared/domains';
import { PromptCard } from './PromptCard';
import { PromptEditor } from './PromptEditor';
import { STR } from './strings';
import type { PromptsController } from './usePromptsController';

export interface PromptsPanelProps {
  controller: PromptsController;
}

/**
 * TEMPORARY (prompt-seed-catalog, task 5.1): the install trigger for this change — a
 * domain choice plus an "Add starter prompts" button that issues `prompts.install`
 * and lets the controller's observe-don't-replay re-read surface the new rows.
 * Replaced by the onboarding domain-picker in a later change.
 */
function StarterPromptControl({ controller: c }: { controller: PromptsController }): JSX.Element {
  const [domain, setDomain] = useState<DomainId>(DOMAIN_REGISTRY[0].id);
  const [added, setAdded] = useState<number | null>(null);
  return (
    <div class="sk-prompts__starter" data-testid="sk-prompts-starter">
      <label class="sk-prompts__starter-label" for="sk-prompts-starter-domain">
        {STR.starterDomainLabel}
      </label>
      <select
        id="sk-prompts-starter-domain"
        class="sk-input"
        data-testid="sk-prompts-starter-domain"
        value={domain}
        onChange={(e) => setDomain((e.currentTarget as HTMLSelectElement).value as DomainId)}
      >
        {DOMAIN_REGISTRY.map((d) => (
          <option key={d.id} value={d.id}>
            {d.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        class="sk-btn sk-btn--ghost"
        data-testid="sk-prompts-starter-add"
        onClick={() => {
          void c.installSeeds(domain).then(setAdded);
        }}
      >
        {STR.starterAdd}
      </button>
      {added !== null ? (
        <span class="sk-prompts__starter-status" role="status" aria-live="polite">
          {STR.starterAdded(added)}
        </span>
      ) : null}
    </div>
  );
}

export function PromptsPanel({ controller: c }: PromptsPanelProps): JSX.Element {
  return (
    <div class="sk-prompts" data-testid="sk-prompts-panel" role="tabpanel" aria-label={STR.panelLabel}>
      <div class="sk-prompts__scroll" data-testid="sk-prompts-scroll">
        <div class="sk-sidebar__section">
          <div class="sk-row sk-sidebar__section-head">
            <span class="sk-sidebar__heading">{STR.sectionTitle}</span>
            <button
              class="sk-icon-btn sk-icon-btn--accent"
              type="button"
              data-testid="sk-prompt-new"
              aria-label={STR.newPromptShort}
              title={STR.newPromptShort}
              onClick={c.openCreate}
            >
              <PlusIcon size={16} />
            </button>
          </div>

          <StarterPromptControl controller={c} />

          {c.status === 'loading' ? (
            <div class="sk-empty" data-testid="sk-prompts-loading" role="status" aria-live="polite">
              <span class="sk-spinner" aria-hidden="true" />
              <p class="sk-empty__body">{STR.loading}</p>
            </div>
          ) : c.status === 'error' ? (
            <div class="sk-empty" data-testid="sk-prompts-error" role="alert">
              <span class="sk-empty__icon" aria-hidden="true">
                <PromptIcon size={40} />
              </span>
              <p class="sk-empty__title">{STR.errorTitle}</p>
              <p class="sk-empty__body">{STR.errorBody}</p>
              <button type="button" class="sk-btn sk-btn--icon" data-testid="sk-prompts-retry" onClick={c.retry}>
                {STR.retry}
              </button>
            </div>
          ) : c.prompts.length === 0 ? (
            <div class="sk-empty" data-testid="sk-prompts-empty-first-run">
              <span class="sk-empty__icon" aria-hidden="true">
                <PromptIcon size={40} />
              </span>
              <p class="sk-empty__title">{STR.firstRunTitle}</p>
              <p class="sk-empty__body">{STR.firstRunBody}</p>
              <button type="button" class="sk-btn sk-btn--icon" data-testid="sk-prompts-create-first" onClick={c.openCreate}>
                <PlusIcon size={16} />
                {STR.newPromptShort}
              </button>
            </div>
          ) : c.filtered.length === 0 ? (
            <div class="sk-empty" data-testid="sk-prompts-empty-no-match">
              <span class="sk-empty__icon" aria-hidden="true">
                <PromptIcon size={40} />
              </span>
              <p class="sk-empty__title">{STR.noMatchTitle}</p>
              <p class="sk-empty__body">{STR.noMatchBody}</p>
              <button type="button" class="sk-btn sk-btn--ghost" data-testid="sk-prompts-clear-filter" onClick={c.clearFilter}>
                {STR.clearFilter}
              </button>
            </div>
          ) : (
            <ul class="sk-prompts__list" data-testid="sk-prompts-list">
              {c.filtered.map((p) => (
                <li key={p.id} class="sk-prompts__item">
                  <PromptCard prompt={p} onEdit={c.openEdit} onDelete={c.deletePrompt} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {c.editorOpen ? (
        <PromptEditor
          // Remount per target so the form reinitializes from the edited prompt.
          key={c.editing?.id ?? 'new'}
          open={c.editorOpen}
          prompt={c.editing}
          folders={c.folders}
          onClose={c.closeEditor}
          onSubmit={c.submitPrompt}
          onCreateCategory={c.createCategory}
        />
      ) : null}
    </div>
  );
}
