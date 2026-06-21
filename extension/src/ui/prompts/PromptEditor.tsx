// The create/edit prompt editor (design D-D): a `Dialog` capturing title, body,
// description, tags, target platforms (multi-select toggle chips), category, and
// slug. While editing the body it shows a LIVE preview of the variables parsed from
// it (name · type · default) via the shared `parseVariables` — preview only; on save
// it sends `body` + metadata and NEVER `variables` (the worker is the single
// authority, D-D). Cleared optional fields are sent as `''`, not unset (D-E). The
// dialog inherits focus-trap / Esc / backdrop dismissal from the primitive.

import { useMemo, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { parseVariables } from '../../core/prompts';
import { PlatformLogo } from '../components/PlatformLogo';
import { UpgradeNudge } from '../components/UpgradeNudge';
import { Dialog } from '../primitives/Dialog';
import type { PlatformId, Prompt, PromptFolder } from '../../shared/types';
import type { QuotaErrorDetail } from '../../core/tier';
import { STR, PLATFORM_LABELS, TARGETABLE_PLATFORMS } from './strings';

/** The flat field set the editor emits on save; the panel turns it into a
 *  `prompt.create` / `prompt.update` op. Optional text fields are `''` (not unset)
 *  when cleared, per D-E. */
export interface PromptEditorSubmit {
  title: string;
  body: string;
  description: string;
  tags: string[];
  targetModels: PlatformId[];
  slug: string;
  promptFolderId: string | null;
}

export interface PromptEditorProps {
  open: boolean;
  /** The prompt being edited, or `undefined` for a create. */
  prompt?: Prompt;
  /** Existing categories offered in the picker. */
  folders: PromptFolder[];
  onClose: () => void;
  /** Persist the prompt (the panel builds + sends the op, then reconciles). */
  onSubmit: (fields: PromptEditorSubmit) => void;
  /** Create a category inline; resolves to its new id so the picker can select it. */
  onCreateCategory: (name: string) => Promise<string | null>;
  /** A tier quota that refused the create (block-with-nudge): when set the editor
   *  stays open with the typed values and shows the upgrade nudge. */
  quota?: QuotaErrorDetail | null;
}

/** Sentinel `<select>` value that reveals the inline "new category" input. */
const NEW_CATEGORY = '__new__';

export function PromptEditor({
  open,
  prompt,
  folders,
  onClose,
  onSubmit,
  onCreateCategory,
  quota,
}: PromptEditorProps): JSX.Element {
  const isEdit = !!prompt;
  const [title, setTitle] = useState(prompt?.title ?? '');
  const [body, setBody] = useState(prompt?.body ?? '');
  const [description, setDescription] = useState(prompt?.description ?? '');
  const [tagsText, setTagsText] = useState((prompt?.tags ?? []).join(', '));
  const [slug, setSlug] = useState(prompt?.slug ?? '');
  const [targets, setTargets] = useState<PlatformId[]>(prompt?.targetModels ?? []);
  const [categoryId, setCategoryId] = useState<string | null>(prompt?.promptFolderId ?? null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live variable preview: re-parse the body on every keystroke. Total + pure, so it
  // never throws for any input (design D-B).
  const variables = useMemo(() => parseVariables(body), [body]);

  const toggleTarget = (p: PlatformId): void =>
    setTargets((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));

  const onCategorySelect = (value: string): void => {
    if (value === NEW_CATEGORY) {
      setShowNewCategory(true);
      return;
    }
    setShowNewCategory(false);
    setCategoryId(value === '' ? null : value);
  };

  const addCategory = async (): Promise<void> => {
    const name = newCategoryName.trim();
    if (!name) return;
    const id = await onCreateCategory(name);
    if (id) setCategoryId(id);
    setNewCategoryName('');
    setShowNewCategory(false);
  };

  const submit = (): void => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError(STR.titleRequired);
      return;
    }
    onSubmit({
      title: trimmed,
      body,
      description: description.trim(),
      tags: tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      targetModels: targets,
      slug: slug.trim(),
      promptFolderId: categoryId,
    });
  };

  // The category <select>'s current value (the new-category sentinel while its input
  // is open, so the option stays selected).
  const selectValue = showNewCategory ? NEW_CATEGORY : (categoryId ?? '');

  return (
    <Dialog
      open={open}
      onClose={onClose}
      ariaLabel={isEdit ? STR.editorEditTitle : STR.editorNewTitle}
      contentTestId="sk-prompt-editor"
    >
      <div class="sk-prompt-editor">
        <div class="sk-dialog__header">
          <h2 class="sk-dialog__title">{isEdit ? STR.editorEditTitle : STR.editorNewTitle}</h2>
        </div>

        <label class="sk-field">
          <span class="sk-field__label">{STR.fieldTitle}</span>
          <input
            class="sk-input"
            type="text"
            data-testid="sk-prompt-editor-title"
            placeholder={STR.fieldTitlePlaceholder}
            value={title}
            onInput={(e) => {
              setTitle((e.target as HTMLInputElement).value);
              if (error) setError(null);
            }}
          />
        </label>

        <label class="sk-field">
          <span class="sk-field__label">{STR.fieldBody}</span>
          <textarea
            class="sk-input sk-prompt-editor__body"
            rows={5}
            data-testid="sk-prompt-editor-body"
            placeholder={STR.fieldBodyPlaceholder}
            value={body}
            onInput={(e) => setBody((e.target as HTMLTextAreaElement).value)}
          />
        </label>

        {/* Live variable preview (D-D): name · type · default, updating as the body
            changes. Purely informational — never sent to the worker. */}
        <div class="sk-prompt-editor__vars" data-testid="sk-prompt-editor-vars">
          <span class="sk-field__label">{STR.variablesPreview}</span>
          {variables.length === 0 ? (
            <p class="sk-text sk-text--muted sk-prompt-editor__vars-empty">{STR.variablesNone}</p>
          ) : (
            <ul class="sk-prompt-editor__var-list">
              {variables.map((v) => (
                <li key={v.name} class="sk-prompt-editor__var" data-testid="sk-prompt-editor-var">
                  <span class="sk-prompt-var">{v.name}</span>
                  <span class="sk-prompt-editor__var-type">{STR.varType(v.type)}</span>
                  {v.default !== undefined ? (
                    <span class="sk-prompt-editor__var-default">{STR.varDefault(v.default)}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <label class="sk-field">
          <span class="sk-field__label">{STR.fieldDescription}</span>
          <input
            class="sk-input"
            type="text"
            data-testid="sk-prompt-editor-description"
            placeholder={STR.fieldDescriptionPlaceholder}
            value={description}
            onInput={(e) => setDescription((e.target as HTMLInputElement).value)}
          />
        </label>

        <fieldset class="sk-fieldset sk-field">
          <legend class="sk-field__label">{STR.fieldTargets}</legend>
          <div class="sk-prompt-editor__targets" role="group" aria-label={STR.fieldTargets}>
            {TARGETABLE_PLATFORMS.map((p) => {
              const on = targets.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  class={`sk-chip${on ? ' sk-chip--active' : ''}`}
                  data-testid={`sk-prompt-editor-target-${p}`}
                  aria-pressed={on}
                  onClick={() => toggleTarget(p)}
                >
                  <span class="sk-chip__logo" aria-hidden="true">
                    <PlatformLogo platform={p} size={14} />
                  </span>
                  {PLATFORM_LABELS[p]}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div class="sk-prompt-editor__row">
          <label class="sk-field sk-prompt-editor__col">
            <span class="sk-field__label">{STR.fieldCategory}</span>
            <select
              class="sk-select"
              data-testid="sk-prompt-editor-category"
              value={selectValue}
              onChange={(e) => onCategorySelect((e.target as HTMLSelectElement).value)}
            >
              <option value="">{STR.uncategorized}</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
              <option value={NEW_CATEGORY}>{STR.newCategory}</option>
            </select>
          </label>

          <label class="sk-field sk-prompt-editor__col">
            <span class="sk-field__label">{STR.fieldSlug}</span>
            <input
              class="sk-input"
              type="text"
              data-testid="sk-prompt-editor-slug"
              placeholder={STR.fieldSlugPlaceholder}
              value={slug}
              onInput={(e) => setSlug((e.target as HTMLInputElement).value)}
            />
          </label>
        </div>

        {showNewCategory ? (
          <div class="sk-prompt-editor__new-category">
            <input
              class="sk-input"
              type="text"
              data-testid="sk-prompt-editor-new-category"
              placeholder={STR.categoryNamePlaceholder}
              value={newCategoryName}
              onInput={(e) => setNewCategoryName((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void addCategory();
                }
              }}
            />
            <button
              type="button"
              class="sk-btn sk-btn--ghost"
              data-testid="sk-prompt-editor-add-category"
              onClick={() => void addCategory()}
            >
              {STR.add}
            </button>
          </div>
        ) : null}

        <label class="sk-field">
          <span class="sk-field__label">{STR.fieldTags}</span>
          <input
            class="sk-input"
            type="text"
            data-testid="sk-prompt-editor-tags"
            placeholder={STR.fieldTagsPlaceholder}
            value={tagsText}
            onInput={(e) => setTagsText((e.target as HTMLInputElement).value)}
          />
        </label>

        {error ? (
          <p class="sk-dialog__error" data-testid="sk-prompt-editor-error">
            {error}
          </p>
        ) : null}

        {quota ? (
          <UpgradeNudge resource="prompts" limit={quota.limit} testId="sk-prompt-quota-nudge" />
        ) : null}

        <div class="sk-dialog__actions">
          <button
            type="button"
            class="sk-btn sk-btn--ghost"
            data-testid="sk-prompt-editor-cancel"
            onClick={onClose}
          >
            {STR.cancel}
          </button>
          <button
            type="button"
            class="sk-btn"
            data-testid="sk-prompt-editor-save"
            onClick={submit}
          >
            {STR.save}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
