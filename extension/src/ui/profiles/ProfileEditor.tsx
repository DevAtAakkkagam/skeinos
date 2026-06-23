// The create/edit instruction-profile editor: a `Dialog` (the same modal style as the
// prompt and folder editors) capturing name, description, instruction text, the
// per-platform APPLY TO toggles, and the response style. The per-platform mode shown
// is PREPEND for every platform (D-3 / D13) — no system-prompt mode is advertised
// until the injection exists. On save it emits the fields; the panel turns them into a
// `profile.create` / `profile.update` op. The dialog inherits focus-trap / Esc /
// backdrop dismissal from the primitive.

import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { PlatformLogo } from '../components/PlatformLogo';
import { UpgradeNudge } from '../components/UpgradeNudge';
import { EnterHint } from '../components/EnterHint';
import { Dialog } from '../primitives/Dialog';
import { SUPPORTED_PLATFORMS as TARGETABLE_PLATFORMS } from '../../shared/branding';
import type { InstructionProfile, PlatformId } from '../../shared/types';
import type { QuotaErrorDetail } from '../../core/tier';
import { PLATFORM_LABELS } from '../../shared/branding';
import { t, useT } from '../../core/i18n';

type ResponseStyle = NonNullable<InstructionProfile['responseStyle']>;
type Verbosity = ResponseStyle['verbosity'];
type Format = ResponseStyle['format'];

/** The field set the editor emits on save; the panel turns it into a `profile.create`
 *  / `profile.update` op. Optional text fields are `''` (not unset) when cleared. */
export interface ProfileEditorSubmit {
  name: string;
  description: string;
  instructionText: string;
  appliesTo: PlatformId[];
  responseStyle: ResponseStyle;
}

export interface ProfileEditorProps {
  open: boolean;
  /** The profile being edited, or `undefined` for a create. */
  profile?: InstructionProfile;
  onClose: () => void;
  /** Persist the profile (the panel builds + sends the op, then reconciles). */
  onSubmit: (fields: ProfileEditorSubmit) => void;
  /** Delete the profile being edited (only offered while editing). */
  onDelete: (profile: InstructionProfile) => void;
  /** A tier quota that refused the create (block-with-nudge): when set the editor
   *  stays open with the typed values and shows the upgrade nudge. */
  quota?: QuotaErrorDetail | null;
}

const DEFAULT_VERBOSITY: Verbosity = 'balanced';
const DEFAULT_FORMAT: Format = 'markdown';

const VERBOSITY_OPTIONS: { value: Verbosity; label: string }[] = [
  { value: 'brief', label: t('profiles.verbosityBrief') },
  { value: 'balanced', label: t('profiles.verbosityBalanced') },
  { value: 'thorough', label: t('profiles.verbosityThorough') },
];
const FORMAT_OPTIONS: { value: Format; label: string }[] = [
  { value: 'markdown', label: t('profiles.formatMarkdown') },
  { value: 'plain', label: t('profiles.formatPlain') },
];

export function ProfileEditor({
  open,
  profile,
  onClose,
  onSubmit,
  onDelete,
  quota,
}: ProfileEditorProps): JSX.Element {
  const t = useT();
  const isEdit = !!profile;
  const [name, setName] = useState(profile?.name ?? '');
  const [description, setDescription] = useState(profile?.description ?? '');
  const [instructionText, setInstructionText] = useState(profile?.instructionText ?? '');
  const [appliesTo, setAppliesTo] = useState<PlatformId[]>(profile?.appliesTo ?? []);
  const [verbosity, setVerbosity] = useState<Verbosity>(
    profile?.responseStyle?.verbosity ?? DEFAULT_VERBOSITY,
  );
  const [format, setFormat] = useState<Format>(profile?.responseStyle?.format ?? DEFAULT_FORMAT);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const toggleApplies = (p: PlatformId): void =>
    setAppliesTo((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));

  const submit = (): void => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t('profiles.nameRequired'));
      return;
    }
    onSubmit({
      name: trimmed,
      description: description.trim(),
      instructionText,
      appliesTo,
      responseStyle: { verbosity, format },
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      ariaLabel={isEdit ? t('profiles.editorEditTitle') : t('profiles.editorNewTitle')}
      contentTestId="sk-profile-editor"
    >
      <form
        class="sk-profile-editor"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div class="sk-dialog__header">
          <h2 class="sk-dialog__title">{isEdit ? t('profiles.editorEditTitle') : t('profiles.editorNewTitle')}</h2>
        </div>

        <label class="sk-field">
          <span class="sk-field__label">{t('profiles.fieldName')}</span>
          <input
            class="sk-input"
            type="text"
            data-testid="sk-profile-name"
            placeholder={t('profiles.fieldNamePlaceholder')}
            value={name}
            onInput={(e) => {
              setName((e.target as HTMLInputElement).value);
              if (error) setError(null);
            }}
          />
        </label>

        <label class="sk-field">
          <span class="sk-field__label">{t('profiles.fieldDescription')}</span>
          <input
            class="sk-input"
            type="text"
            data-testid="sk-profile-description"
            placeholder={t('profiles.fieldDescriptionPlaceholder')}
            value={description}
            onInput={(e) => setDescription((e.target as HTMLInputElement).value)}
          />
        </label>

        <label class="sk-field">
          <span class="sk-field__label">{t('profiles.fieldInstruction')}</span>
          <textarea
            class="sk-input sk-profile-editor__instruction"
            rows={5}
            data-testid="sk-profile-instruction"
            placeholder={t('profiles.fieldInstructionPlaceholder')}
            value={instructionText}
            onInput={(e) => setInstructionText((e.target as HTMLTextAreaElement).value)}
          />
        </label>

        {/* APPLY TO (D-3): a wrapping cluster of platform toggle chips. The injection
            mode is PREPEND for every platform this slice, so it's stated once as a quiet
            caption rather than repeated per row — no system-prompt mode is advertised. */}
        <fieldset class="sk-fieldset sk-field">
          <legend class="sk-field__label">{t('profiles.appliesToLegend')}</legend>
          <div class="sk-profile-editor__applies" data-testid="sk-profile-applies">
            {TARGETABLE_PLATFORMS.map((p) => {
              const on = appliesTo.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  class={`sk-chip${on ? ' sk-chip--active' : ''}`}
                  data-testid={`sk-profile-applies-${p}`}
                  aria-pressed={on}
                  onClick={() => toggleApplies(p)}
                >
                  <span class="sk-chip__logo" aria-hidden="true">
                    <PlatformLogo platform={p} size={14} />
                  </span>
                  {PLATFORM_LABELS[p]}
                </button>
              );
            })}
          </div>
          <p class="sk-profile-editor__apply-note" data-testid="sk-profile-apply-mode">
            {t('profiles.applyModeNote')}
          </p>
        </fieldset>

        {/* Response style: verbosity + format as two label-left segmented rows. */}
        <fieldset class="sk-fieldset sk-field">
          <legend class="sk-field__label">{t('profiles.responseStyleLegend')}</legend>
          <div class="sk-profile-editor__style-row">
            <span class="sk-profile-editor__style-label">{t('profiles.verbosityLabel')}</span>
            <div class="sk-segmented" role="group" aria-label={t('profiles.verbosityLabel')} data-testid="sk-profile-verbosity">
              {VERBOSITY_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  class={`sk-segmented__btn${verbosity === o.value ? ' sk-segmented__btn--active' : ''}`}
                  data-testid={`sk-profile-verbosity-${o.value}`}
                  aria-pressed={verbosity === o.value}
                  onClick={() => setVerbosity(o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div class="sk-profile-editor__style-row">
            <span class="sk-profile-editor__style-label">{t('profiles.formatLabel')}</span>
            <div class="sk-segmented" role="group" aria-label={t('profiles.formatLabel')} data-testid="sk-profile-format">
              {FORMAT_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  class={`sk-segmented__btn${format === o.value ? ' sk-segmented__btn--active' : ''}`}
                  data-testid={`sk-profile-format-${o.value}`}
                  aria-pressed={format === o.value}
                  onClick={() => setFormat(o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </fieldset>

        {error ? (
          <p class="sk-dialog__error" data-testid="sk-profile-editor-error">
            {error}
          </p>
        ) : null}

        {quota ? (
          <UpgradeNudge resource="profiles" limit={quota.limit} testId="sk-profile-quota-nudge" />
        ) : null}

        <div class="sk-dialog__actions sk-profile-editor__actions">
          {isEdit ? (
            <button
              type="button"
              class="sk-btn sk-btn--ghost sk-profile-editor__delete"
              data-testid="sk-profile-delete"
              onClick={() => setConfirmDelete(true)}
            >
              {t('profiles.deleteProfile')}
            </button>
          ) : null}
          <button
            type="button"
            class="sk-btn sk-btn--ghost"
            data-testid="sk-profile-editor-cancel"
            onClick={onClose}
          >
            {t('profiles.cancel')}
          </button>
          <button type="submit" class="sk-btn" data-testid="sk-profile-editor-save">
            {t('profiles.save')}
            <EnterHint />
          </button>
        </div>
      </form>

      {confirmDelete && profile ? (
        <Dialog
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          ariaLabel={t('profiles.confirmDeleteTitle')}
          contentTestId="sk-profile-delete-confirm"
        >
          <div class="sk-dialog__body">
            <h2 class="sk-dialog__title">{t('profiles.confirmDeleteTitle')}</h2>
            <p class="sk-text sk-text--muted">
              {t('profiles.confirmDeleteBody', { name: profile.name || t('profiles.defaultName') })}
            </p>
            <div class="sk-dialog__actions">
              <button
                type="button"
                class="sk-btn sk-btn--ghost"
                data-testid="sk-profile-delete-cancel"
                onClick={() => setConfirmDelete(false)}
              >
                {t('profiles.cancel')}
              </button>
              <button
                type="button"
                class="sk-btn sk-btn--danger"
                data-testid="sk-profile-delete-confirm-btn"
                onClick={() => {
                  setConfirmDelete(false);
                  onDelete(profile);
                }}
              >
                {t('profiles.confirmDelete')}
              </button>
            </div>
          </div>
        </Dialog>
      ) : null}
    </Dialog>
  );
}
