// A single labelled consent switch, shared by the options page and the onboarding
// privacy step (observability, tasks 2.2 + 7.1) so the two surfaces can never show
// divergent copy or default state. Pure presentational + keyboard-operable: a
// native checkbox carries the on/off semantics and ARIA; the caller owns the value.

import type { JSX } from 'preact';

export interface ConsentToggleProps {
  /** Short control label (also the checkbox's accessible name). */
  label: string;
  /** One-line explanation of what is and isn't sent. */
  body: string;
  /** Current on/off state (owned by the caller). */
  checked: boolean;
  /** Called with the next state when toggled. */
  onChange: (value: boolean) => void;
  /** Test id for the row. */
  testId: string;
}

export function ConsentToggle({ label, body, checked, onChange, testId }: ConsentToggleProps): JSX.Element {
  return (
    <label class="sk-consent" data-testid={testId}>
      <input
        type="checkbox"
        class="sk-consent__input"
        checked={checked}
        aria-label={label}
        onChange={(e) => onChange((e.currentTarget as HTMLInputElement).checked)}
      />
      <span class="sk-consent__text">
        <span class="sk-consent__label">{label}</span>
        <span class="sk-consent__body">{body}</span>
      </span>
    </label>
  );
}
