import { render, type ComponentChild } from 'preact';
import { THEME_CSS } from './theme/tokens';
import { COMPONENT_CSS } from './styles';

// The one place CSS isolation is solved (decision D3). Every ui/* feature mounts
// through here rather than re-solving the shadow boundary itself.

export type Theme = 'light' | 'dark' | 'system';

export interface MountHandle {
  /** The host element placed in the host page's light DOM. */
  host: HTMLElement;
  /** The open shadow root the UI lives in. */
  shadowRoot: ShadowRoot;
  /** Switch theme by flipping the host's data-theme attribute. */
  setTheme(theme: Theme): void;
  /** Unmount the Preact tree and remove the host node from the page. */
  dispose(): void;
}

export interface MountOptions {
  theme?: Theme;
}

export function mount(
  target: HTMLElement,
  vnode: ComponentChild,
  opts: MountOptions = {},
): MountHandle {
  const host = document.createElement('div');
  host.setAttribute('data-skeinos-root', '');

  // Open mode: the shadow boundary provides the isolation; open lets tests and
  // our own code reach in (decision D4).
  const shadowRoot = host.attachShadow({ mode: 'open' });

  // Styles go into the shadow root, never the host document.
  const style = document.createElement('style');
  style.textContent = `${THEME_CSS}\n${COMPONENT_CSS}`;
  shadowRoot.appendChild(style);

  const app = document.createElement('div');
  shadowRoot.appendChild(app);

  const setTheme = (theme: Theme) => host.setAttribute('data-theme', theme);
  setTheme(opts.theme ?? 'system');

  // Attach to the page only after the shadow tree is set up.
  target.appendChild(host);
  render(vnode, app);

  return {
    host,
    shadowRoot,
    setTheme,
    dispose() {
      render(null, app);
      host.remove();
    },
  };
}
