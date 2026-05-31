import { h } from 'preact';
import { mount } from '../../ui/mount';
import { OptionsApp } from '../../ui/options/OptionsApp';
import { getSettings } from '../../core/settings';

// The options page bootstraps the same shadow-DOM mount + theme tokens as the
// overlay (ui-shell), so the page and the in-tab overlay never diverge. The
// initial theme is read from storage so the page opens already themed; later
// theme changes re-flip the host attribute via the mount handle.
async function main() {
  const initial = await getSettings();
  const handle = mount(
    document.body,
    h(OptionsApp, { onThemeChange: (theme) => handle.setTheme(theme) }),
    { theme: initial.theme },
  );
}

void main();
