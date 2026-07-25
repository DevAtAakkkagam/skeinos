import { h } from 'preact';
import { mount } from '../../ui/mount';
import { WelcomeApp } from '../../ui/welcome/WelcomeApp';
import { WELCOME_CSS } from '../../ui/welcome/styles';
import { getSettings, subscribeSettings } from '../../core/settings';
import { ensureLocale } from '../../core/i18n';

// The install welcome page bootstraps the same shadow-DOM mount + theme tokens as
// the options page and side panel, so surfaces never diverge. The initial theme
// is read from storage so the tab opens already themed; a later theme change (in
// the options page) re-flips the host attribute live. The page's own token-based
// CSS is injected into the shadow root, mirroring `mountSidebar`.
async function main() {
  // Load the active locale's catalog before first paint (non-English is code-split).
  const [initial] = await Promise.all([getSettings(), ensureLocale()]);

  // This is a full page we own and it scrolls as a document, so the reset only
  // drops the default body margin and paints the body the token background for
  // both schemes — otherwise the area outside the mount host flashes white on a
  // dark-themed OS before the shadow tree's own background covers the viewport.
  const reset = document.createElement('style');
  reset.textContent =
    'html, body { margin: 0; }\n' +
    'body { background: #fbfcff; }\n' +
    '@media (prefers-color-scheme: dark) { body { background: #191a21; } }';
  document.head.appendChild(reset);

  const handle = mount(document.body, h(WelcomeApp, {}), { theme: initial.theme });
  const style = document.createElement('style');
  style.textContent = WELCOME_CSS;
  handle.shadowRoot.appendChild(style);
  subscribeSettings((s) => handle.setTheme(s.theme));
}

void main();
