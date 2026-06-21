// The variable-fill modal (design D-5). When a picked prompt declares `{{variables}}`,
// this opens a `Dialog` (the shared modal primitive — focus trap, Escape/backdrop
// dismissal, ARIA) with one input per variable, pre-filled with the variable's parsed
// default. Each input is a text field or a `<select>` per the variable's parsed type
// (D14). Confirming returns the entered values keyed by name; the caller substitutes
// them into the body. A prompt with no variables never reaches this component (the
// caller inserts directly). Styled from `--sk-*` tokens, no inline literals.

import { useMemo, useState } from 'preact/hooks';
import { Dialog } from '../primitives/Dialog';
import type { PromptVar } from '../../shared/types';
import { STR } from './strings';

export interface VariableModalProps {
  /** The prompt's title, shown in the modal heading. */
  title: string;
  /** The variables to fill (already non-empty — the caller skips the modal otherwise). */
  variables: PromptVar[];
  /** Confirm: the entered values keyed by variable name. */
  onConfirm: (values: Record<string, string>) => void;
  /** Dismiss without inserting (Cancel / Escape / backdrop). */
  onCancel: () => void;
}

/** Seed each field with its parsed default (empty string when none) so confirming
 *  without edits reproduces the prompt's own defaults. */
function initialValues(variables: PromptVar[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of variables) out[v.name] = v.default ?? '';
  return out;
}

export function VariableModal({ title, variables, onConfirm, onCancel }: VariableModalProps) {
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(variables));

  // Stable field id seed so each label binds to its control across re-renders.
  const ids = useMemo(
    () => Object.fromEntries(variables.map((v, i) => [v.name, `sk-ib-var-${i}`])),
    [variables],
  );

  const set = (name: string, value: string): void =>
    setValues((prev) => ({ ...prev, [name]: value }));

  // Keep keystrokes inside the modal. Like the popover, shadow-DOM events are
  // composed and bubble onto the host page, where editors (e.g. Claude) capture them
  // into the native composer — so typing in a variable field would land in the host
  // box. Stop them here, but let Escape through so the Dialog (Zag) can still close.
  const stopKeyFromHost = (e: { key?: string; stopPropagation: () => void }): void => {
    if (e.key !== 'Escape') e.stopPropagation();
  };

  return (
    <Dialog
      open
      onClose={onCancel}
      ariaLabel={STR.modalLabel}
      contentTestId="sk-ib-var-modal"
    >
      <div
        class="sk-ib-modal"
        onKeyDown={stopKeyFromHost}
        onKeyUp={stopKeyFromHost}
        onKeyPress={(e) => e.stopPropagation()}
        onInput={(e) => e.stopPropagation()}
        onBeforeInput={(e) => e.stopPropagation()}
      >
        <div class="sk-dialog__header">
          <h2 class="sk-dialog__title">{STR.modalTitle(title)}</h2>
        </div>

        {variables.map((v) => (
          <label key={v.name} class="sk-field" for={ids[v.name]}>
            <span class="sk-field__label">{v.name}</span>
            {v.type === 'select' && v.options && v.options.length > 0 ? (
              <select
                id={ids[v.name]}
                class="sk-select"
                data-testid={`sk-ib-var-${v.name}`}
                value={values[v.name]}
                onChange={(e) => set(v.name, (e.target as HTMLSelectElement).value)}
              >
                {v.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={ids[v.name]}
                class="sk-input"
                type="text"
                data-testid={`sk-ib-var-${v.name}`}
                value={values[v.name]}
                onInput={(e) => set(v.name, (e.target as HTMLInputElement).value)}
              />
            )}
          </label>
        ))}

        <div class="sk-dialog__actions">
          <button
            type="button"
            class="sk-btn sk-btn--ghost"
            data-testid="sk-ib-var-cancel"
            onClick={onCancel}
          >
            {STR.cancel}
          </button>
          <button
            type="button"
            class="sk-btn"
            data-testid="sk-ib-var-insert"
            onClick={() => onConfirm(values)}
          >
            {STR.insert}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
