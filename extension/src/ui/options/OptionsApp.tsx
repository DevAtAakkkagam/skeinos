import { useEffect, useState } from 'preact/hooks';
import {
  getSettings,
  setSettings,
  subscribeSettings,
} from '../../core/settings';
import { DEFAULT_SETTINGS, type Settings, type Theme } from '../../shared/settings';
import { Panel } from '../components/Panel';
import { Text } from '../components/Text';

// The options-page skeleton (T0.5). It reads current settings, renders them, and
// wires a theme control to setSettings. Per-platform toggles, shortcut editing,
// and sync controls are added later by their owning features — they extend this
// surface rather than create it.

// User-facing strings kept in one place so this stays i18n-ready (no inline
// literals in markup), matching the [PREACT] guardrail.
const STR = {
  heading: 'Skeinos settings',
  theme: 'Theme',
  telemetry: 'Usage telemetry',
  on: 'On',
  off: 'Off',
} as const;

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export interface OptionsAppProps {
  /** Called after a theme change persists, so the host can re-theme live. */
  onThemeChange?: (theme: Theme) => void;
}

export function OptionsApp({ onThemeChange }: OptionsAppProps) {
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
      <Text>{STR.heading}</Text>
      <label class="sk-stack">
        <Text muted>{STR.theme}</Text>
        <select
          class="sk-select"
          data-testid="sk-theme-select"
          aria-label={STR.theme}
          value={settings.theme}
          onChange={(e) =>
            void changeTheme((e.currentTarget as HTMLSelectElement).value as Theme)
          }
        >
          {THEME_OPTIONS.map((o) => (
            <option value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
      <Text muted>
        {STR.telemetry}: {settings.telemetry ? STR.on : STR.off}
      </Text>
    </Panel>
  );
}
