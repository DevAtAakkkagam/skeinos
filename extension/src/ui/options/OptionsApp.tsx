import { useEffect, useState } from 'preact/hooks';
import {
  getSettings,
  setSettings,
  subscribeSettings,
} from '../../core/settings';
import { DEFAULT_SETTINGS, type Settings, type Theme } from '../../shared/settings';
import { Panel } from '../components/Panel';
import { Text } from '../components/Text';
import { FEEDBACK_URL, REVIEW_URL, SOURCE_URL } from '../../shared/links';
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
      </div>
      <div class="sk-stack" data-testid="sk-support">
        <Text>{t('options.supportHeading')}</Text>
        <Text muted>{t('options.supportIntro')}</Text>
        <div style={{ display: 'flex', gap: 'var(--sk-space-2)', flexWrap: 'wrap' }}>
          <button
            type="button"
            class="sk-btn"
            data-testid="sk-send-feedback"
            onClick={() => void globalThis.open?.(FEEDBACK_URL, '_blank', 'noopener')}
          >
            {t('options.sendFeedback')}
          </button>
          <button
            type="button"
            class="sk-btn sk-btn--ghost"
            data-testid="sk-source-code"
            onClick={() => void globalThis.open?.(SOURCE_URL, '_blank', 'noopener')}
          >
            {t('options.sourceCode')}
          </button>
          <button
            type="button"
            class="sk-btn sk-btn--ghost"
            data-testid="sk-rate"
            onClick={() => void globalThis.open?.(REVIEW_URL, '_blank', 'noopener')}
          >
            {t('options.rateExtension')}
          </button>
        </div>
      </div>
    </Panel>
  );
}
