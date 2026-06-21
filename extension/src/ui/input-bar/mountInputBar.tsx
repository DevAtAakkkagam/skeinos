// Mounts the input action bar via the shared shadow-DOM harness (ui-shell), then
// injects the bar's own token-based CSS into that shadow root — so feature styles
// stay out of the host document and out of the generic harness. Mirrors
// `mountSidebar`; the content script calls this with the adapter's `inputBar` anchor.
//
// `onInsert` is wired by the caller to `adapter.insertText(text)` (append-only, never
// `submit()` — design D-5), keeping this helper free of any adapter import.

import { mount, type MountHandle, type MountOptions } from '../mount';
import type { PlatformId } from '../../shared/types';
import { InputBar } from './InputBar';
import { INPUT_BAR_CSS } from './styles';

export interface MountInputBarOptions extends MountOptions {
  /** The current platform — threaded to the Profile chip's `appliesTo` gating. */
  platform: PlatformId;
  /** Commit the chosen prompt text into the host composer (append-only). */
  onInsert: (text: string) => void;
  /** Contain popover focus — for hosts whose composer steals focus
   *  (`behaviors.composerStealsFocus`). Default off. */
  containFocus?: boolean;
}

/** Does this element lay its children out as a normal vertical block flow, so a
 *  block child lands on its own line below its siblings? Flex-row / inline / grid /
 *  table parents place a block child BESIDE the composer instead (the Gemini/
 *  Perplexity "bar beside the input" bug), so those are not column flows. */
function laysOutInColumn(el: Element): boolean {
  const cs = getComputedStyle(el);
  const d = cs.display;
  if (d === 'flex' || d === 'inline-flex') return cs.flexDirection.startsWith('column');
  return d === 'block' || d === 'flow-root' || d === 'list-item';
}

/** Dock `host` as a block sibling on its OWN line below the composer. Starting at the
 *  composer anchor, climb out of any row-like ancestor (whose parent would place the
 *  bar beside the composer) until we reach a node sitting in a normal vertical block
 *  flow, then insert after it. Bounded so a page that is flex-rows all the way up
 *  can't walk to `<body>`. Falls back to right-after the anchor. */
function dockAfterComposer(anchor: HTMLElement, host: HTMLElement): void {
  let node: HTMLElement = anchor;
  for (let hops = 0; hops < 5; hops++) {
    const parent = node.parentElement;
    if (!parent || laysOutInColumn(parent)) break;
    node = parent;
  }
  node.insertAdjacentElement('afterend', host);
}

export function mountInputBar(
  target: HTMLElement,
  { platform, onInsert, containFocus, ...opts }: MountInputBarOptions,
): MountHandle {
  const handle = mount(
    target,
    <InputBar platform={platform} onInsert={onInsert} containFocus={containFocus} />,
    opts,
  );
  // The host node carries no feature CSS (that lives in the shadow root), but it must
  // be a full-width block with a stacking context so the bar lands on its own line
  // and above the host composer chrome regardless of the anchor's display/overflow.
  handle.host.style.display = 'block';
  handle.host.style.width = '100%';
  handle.host.style.position = 'relative';
  handle.host.style.zIndex = '2147483646';
  // Dock the bar as a block sibling on its own line below the composer rather than
  // inside the anchor. `mount()` appended the host into the anchor; `dockAfterComposer`
  // moves it out and climbs past any row-like ancestors so the bar isn't laid out
  // BESIDE the composer (Gemini's `input-area-v2`, Perplexity's `#ask-input` row).
  dockAfterComposer(target, handle.host);
  const style = document.createElement('style');
  style.textContent = INPUT_BAR_CSS;
  handle.shadowRoot.appendChild(style);
  return handle;
}
