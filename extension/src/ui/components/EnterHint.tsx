// A small ↵ glyph shown inside a dialog's primary button to signal that pressing
// Enter submits the form. Purely decorative (aria-hidden) — the actual behaviour
// comes from the surrounding `<button type="submit">` in a `<form>`, so screen
// readers announce the button label without the symbol.

import type { JSX } from 'preact';

export function EnterHint(): JSX.Element {
  return (
    <kbd class="sk-btn__enter" aria-hidden="true">
      ↵
    </kbd>
  );
}
