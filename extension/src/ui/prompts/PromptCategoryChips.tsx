// The Prompts tab's filter row — the prompt-library analog of the Folders tab's
// platform chips. It renders in the SHELL's filter slot (same position/structure as
// `sk-filters` for folders) so both tabs share one filter affordance: an "All" reset
// chip, one chip per category with a rename/delete overflow menu, the trailing
// "+ New category" ghost chip (mirrors "+ Tag"), and — when the active category has
// tagged prompts — a second row of tag chips. Counts are client-derived (D-B). The
// create/rename and delete-category dialogs live here, co-located with their triggers.

import type { JSX } from 'preact';
import { MoreIcon } from '../components/Icon';
import { EnterHint } from '../components/EnterHint';
import { Dialog } from '../primitives/Dialog';
import { OverflowMenu } from './OverflowMenu';
import { STR } from './strings';
import type { PromptsController } from './usePromptsController';

export interface PromptCategoryChipsProps {
  controller: PromptsController;
}

export function PromptCategoryChips({ controller: c }: PromptCategoryChipsProps): JSX.Element {
  return (
    <div class="sk-filters" data-testid="sk-prompt-filters">
      {/* One wrapping filter row (uniform with the Folders platform row): the All
          reset, one chip per category (client-derived count + rename/delete menu), the
          "+ New category" ghost, then the live tag chips — all flowing inline and
          wrapping only on width, rather than the tags forcing their own line. */}
      <div
        class="sk-filter-row__chips"
        role="group"
        aria-label={STR.filterLabel}
        data-testid="sk-prompt-categories"
      >
        <button
          type="button"
          class={`sk-chip${c.category === 'all' ? ' sk-chip--active' : ''}`}
          data-testid="sk-prompt-cat-all"
          aria-pressed={c.category === 'all'}
          onClick={() => c.setCategory('all')}
        >
          {STR.all}
          <span class="sk-chip__count">{c.prompts.length}</span>
        </button>
        {c.folders.map((f) => (
          <span key={f.id} class="sk-prompt-cat">
            <button
              type="button"
              class={`sk-chip${c.category === f.id ? ' sk-chip--active' : ''}`}
              data-testid={`sk-prompt-cat-${f.id}`}
              aria-pressed={c.category === f.id}
              onClick={() => c.setCategory(f.id)}
            >
              {f.name}
              <span class="sk-chip__count">{c.categoryCount.get(f.id) ?? 0}</span>
            </button>
            <span class="sk-prompt-cat__menu">
              <OverflowMenu
                trigger={<MoreIcon size={14} />}
                ariaLabel={f.name}
                triggerTestId={`sk-prompt-cat-menu-${f.id}`}
                contentTestId={`sk-prompt-cat-menu-content-${f.id}`}
                onSelect={(v) => {
                  if (v === 'rename') c.openRenameCategory(f);
                  else if (v === 'delete') c.requestDeleteCategory(f);
                }}
                items={[
                  { value: 'rename', label: STR.renameCategory, testid: `sk-prompt-cat-rename-${f.id}` },
                  { value: 'delete', label: STR.deleteCategory, testid: `sk-prompt-cat-delete-${f.id}` },
                ]}
              />
            </span>
          </span>
        ))}
        <button
          type="button"
          class="sk-chip sk-chip--add"
          data-testid="sk-prompt-new-category"
          onClick={c.openCreateCategory}
        >
          {STR.newCategory}
        </button>
        {c.tagChips.map((t) => (
          <button
            key={t}
            type="button"
            class={`sk-chip sk-chip--tag${c.selectedTags.includes(t) ? ' sk-chip--active' : ''}`}
            data-testid={`sk-prompt-tag-${t}`}
            aria-pressed={c.selectedTags.includes(t)}
            onClick={() => c.toggleTag(t)}
          >
            {t}
            <span class="sk-chip__count">{c.tagCount.get(t) ?? 0}</span>
          </button>
        ))}
      </div>

      {/* Create / rename category dialog. */}
      <Dialog
        open={c.categoryDialog !== null}
        onClose={c.closeCategoryDialog}
        ariaLabel={c.categoryDialog?.mode === 'rename' ? STR.renameCategoryTitle : STR.createCategoryTitle}
        contentTestId="sk-prompt-category-dialog"
      >
        <form
          class="sk-dialog__body"
          onSubmit={(e) => {
            e.preventDefault();
            c.submitCategoryDialog();
          }}
        >
          <h2 class="sk-dialog__title">
            {c.categoryDialog?.mode === 'rename' ? STR.renameCategoryTitle : STR.createCategoryTitle}
          </h2>
          <input
            class="sk-input"
            type="text"
            data-testid="sk-prompt-category-name"
            placeholder={STR.categoryNamePlaceholder}
            value={c.categoryName}
            onInput={(e) => c.setCategoryName((e.target as HTMLInputElement).value)}
          />
          <div class="sk-dialog__actions">
            <button
              type="button"
              class="sk-btn sk-btn--ghost"
              data-testid="sk-prompt-category-cancel"
              onClick={c.closeCategoryDialog}
            >
              {STR.cancel}
            </button>
            <button type="submit" class="sk-btn" data-testid="sk-prompt-category-save">
              {STR.save}
              <EnterHint />
            </button>
          </div>
        </form>
      </Dialog>

      {/* Delete-category confirm (reassigns its prompts to uncategorized). */}
      <Dialog
        open={c.deleteCategoryTarget !== null}
        onClose={c.cancelDeleteCategory}
        ariaLabel={STR.confirmDeleteCategoryTitle}
        contentTestId="sk-prompt-category-delete-confirm"
      >
        <div class="sk-dialog__body">
          <h2 class="sk-dialog__title">{STR.confirmDeleteCategoryTitle}</h2>
          <p class="sk-text sk-text--muted">
            {c.deleteCategoryTarget ? STR.confirmDeleteCategoryBody(c.deleteCategoryTarget.name) : ''}
          </p>
          <div class="sk-dialog__actions">
            <button
              type="button"
              class="sk-btn sk-btn--ghost"
              data-testid="sk-prompt-category-delete-cancel"
              onClick={c.cancelDeleteCategory}
            >
              {STR.cancel}
            </button>
            <button
              type="button"
              class="sk-btn sk-btn--danger"
              data-testid="sk-prompt-category-delete-confirm-btn"
              onClick={c.confirmDeleteCategory}
            >
              {STR.confirmDelete}
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
