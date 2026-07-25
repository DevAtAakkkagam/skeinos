import { h } from 'preact';
import { mount } from '../../ui/mount';
import { OptionsApp } from '../../ui/options/OptionsApp';
import { getSettings } from '../../core/settings';
import { ensureLocale } from '../../core/i18n';

// The options page bootstraps the same shadow-DOM mount + theme tokens as the
// overlay (ui-shell), so the page and the in-tab overlay never diverge. The
// initial theme is read from storage so the page opens already themed; later
// theme changes re-flip the host attribute via the mount handle.
async function main() {
  // Load the active locale's catalog before first paint (non-English is code-split).
  const [initial] = await Promise.all([getSettings(), ensureLocale()]);
  const handle = mount(
    document.body,
    h(OptionsApp, { onThemeChange: (theme) => handle.setTheme(theme) }),
    { theme: initial.theme },
  );
}

void main();
