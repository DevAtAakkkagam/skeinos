import { useEffect, useState } from 'preact/hooks';
import {
  getSettings,
  setSettings,
  subscribeSettings,
} from '../../core/settings';
import { DEFAULT_SETTINGS, type Settings, type Theme } from '../../shared/settings';
import { Panel } from '../components/Panel';
import { Text } from '../components/Text';
import { ConsentToggle } from '../components/ConsentToggle';
import { useT, type MessageKey } from '../../core/i18n';

// The options-page skeleton (T0.5). It reads current settings, renders them, and
// wires a theme control to setSettings. Per-platform toggles, shortcut editing,
// and sync controls are added later by their owning features — they extend this
// surface rather than create it.

const THEME_OPTIONS: { value: Theme; labelKey: MessageKey }[] = [
  { value: 'system', labelKey: 'options.themeSystem' },
  { value: 'light', labelKey: 'options.themeLight' },
  { value: 'dark', labelKey: 'options.themeDark' },
];

export interface OptionsAppProps {
  /** Called after a theme change persists, so the host can re-theme live. */
  onThemeChange?: (theme: Theme) => void;
}

export function OptionsApp({ onThemeChange }: OptionsAppProps) {
  const t = useT();
  const [settings, setLocal] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    let active = true;
    void getSettings().then((s) => {
      if (active) setLocal(s);
    });
    // Stay live if another surface (or this page reopened elsewhere) changes it.
    const dispose = subscribeSettings(setLocal);
    return () => {
      active = false;
      dispose();
    };
  }, []);

  const changeTheme = async (theme: Theme) => {
    setLocal((s) => ({ ...s, theme })); // optimistic, before storage round-trip
    await setSettings({ theme });
    onThemeChange?.(theme);
  };

  const toggleConsent = async (key: 'diagnosticsOptIn', value: boolean) => {
    setLocal((s) => ({ ...s, [key]: value })); // optimistic
    await setSettings({ [key]: value });
  };

  return (
    <Panel>
      <Text>{t('options.heading')}</Text>
      <label class="sk-stack">
        <Text muted>{t('options.theme')}</Text>
        <select
          class="sk-select"
          data-testid="sk-theme-select"
          aria-label={t('options.theme')}
          value={settings.theme}
          onChange={(e) =>
            void changeTheme((e.currentTarget as HTMLSelectElement).value as Theme)
          }
        >
          {THEME_OPTIONS.map((o) => (
            <option value={o.value}>{t(o.labelKey)}</option>
          ))}
        </select>
      </label>
      <div class="sk-stack" data-testid="sk-privacy-settings">
        <Text>{t('options.privacyHeading')}</Text>
        <Text muted>{t('options.privacyIntro')}</Text>
        <ConsentToggle
          testId="sk-consent-diagnostics"
          label={t('options.diagnosticsLabel')}
          body={t('options.diagnosticsBody')}
          checked={settings.diagnosticsOptIn}
          onChange={(v) => void toggleConsent('diagnosticsOptIn', v)}
        />
      </div>
    </Panel>
  );
}
