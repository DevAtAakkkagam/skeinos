import { h } from 'preact';
import { mount } from '../../ui/mount';
import { SidePanelApp } from './SidePanelApp';
import { SIDEBAR_CSS } from '../../ui/sidebar/styles';
import { ONBOARDING_CSS } from '../../ui/onboarding/styles';
import { getSettings, subscribeSettings } from '../../core/settings';
import { ensureLocale } from '../../core/i18n';

// The side panel bootstraps the same shadow-DOM mount + theme tokens as the
// options page and the (former) overlay (ui-shell), so the surfaces never
// diverge. The initial theme is read from storage so the panel opens already
// themed; later theme changes (from the options page) re-flip the host attribute
// live. The sidebar's own token-based CSS is injected into the shadow root, same
// as the in-page `mountSidebar` did — keeping feature styles out of the harness.
async function main() {
  // Load the active locale's catalog before first paint so the panel opens already
  // translated (non-English catalogs are code-split; English/pseudo need no load).
  const [initial] = await Promise.all([getSettings(), ensureLocale()]);

  // The side panel is a full extension page we own, so establish a full-height
  // chain (html › body › mount host) — otherwise the shell's `height: 100%` has
  // no sized ancestor to resolve against and collapses to its content height,
  // leaving the footer floating mid-panel instead of pinned to the bottom.
  const reset = document.createElement('style');
  reset.textContent =
    'html, body { height: 100%; margin: 0; }\n' +
    'body > [data-skeinos-root] { height: 100%; }';
  document.head.appendChild(reset);

  const handle = mount(document.body, h(SidePanelApp, {}), { theme: initial.theme });
  const style = document.createElement('style');
  style.textContent = `${SIDEBAR_CSS}\n${ONBOARDING_CSS}`;
  handle.shadowRoot.appendChild(style);
  subscribeSettings((s) => handle.setTheme(s.theme));
}

void main();
