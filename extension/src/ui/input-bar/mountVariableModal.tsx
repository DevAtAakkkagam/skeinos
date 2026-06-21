// Mounts the variable-fill modal as its OWN shadow-DOM overlay at `document.body`,
// separate from the bar's overlay at the composer anchor.
//
// Why a separate mount and not just rendering the modal inside the bar's tree: the
// bar docks next to the host composer, whose ancestors frequently carry a CSS
// `transform`/`filter`/`contain` (e.g. Gemini). Per the CSS spec those make the
// ancestor the containing block for `position: fixed`, so the Dialog's full-screen
// backdrop would be clipped to the composer's box instead of the viewport (the Gemini
// "grey overlay only over the input box" bug). Mounting at `document.body` escapes
// that subtree, so the backdrop covers the whole viewport on every host. Mirrors
// `mountInputBar`'s shadow-root + token-CSS setup.

import { mount, type MountHandle } from '../mount';
import { VariableModal } from './VariableModal';
import { INPUT_BAR_CSS } from './styles';
import type { PromptVar } from '../../shared/types';

export interface MountVariableModalArgs {
  title: string;
  variables: PromptVar[];
  onConfirm: (values: Record<string, string>) => void;
  onCancel: () => void;
}

export function mountVariableModal(args: MountVariableModalArgs): MountHandle {
  const handle = mount(
    document.body,
    <VariableModal
      title={args.title}
      variables={args.variables}
      onConfirm={args.onConfirm}
      onCancel={args.onCancel}
    />,
  );
  const style = document.createElement('style');
  style.textContent = INPUT_BAR_CSS;
  handle.shadowRoot.appendChild(style);
  return handle;
}
