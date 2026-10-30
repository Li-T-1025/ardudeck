import { Palette } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore, type ThemePreference } from '../../stores/settings-store';

const OPTIONS: { value: ThemePreference; labelKey: string }[] = [
  { value: 'dark', labelKey: 'navigation:navigationRail.themeDark' },
  { value: 'light', labelKey: 'navigation:navigationRail.themeLight' },
  { value: 'system', labelKey: 'navigation:navigationRail.themeSystem' },
  { value: 'bridge', labelKey: 'tribute:theme.bridge' },
];

export function ThemeCard() {
  const { t } = useTranslation();
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);

  return (
    <div className="bg-gradient-to-br from-surface to-surface-base rounded-xl border border-subtle p-4 mb-4">
      <div className="flex items-center gap-3 mb-4">
        <Palette className="w-4 h-4 text-amber-400" aria-hidden="true" />
        <div className="text-sm font-medium text-content">{t('settings:themeTitle')}</div>
      </div>
      <label className="block max-w-sm space-y-1.5">
        <select
          value={theme}
          onChange={(event) => setTheme(event.target.value as ThemePreference)}
          className="w-full bg-surface-input border border-border rounded-lg px-3 py-2 text-sm text-content focus:outline-none focus:border-blue-500/50"
        >
          {OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
          ))}
        </select>
        <span className="block text-xs text-content-secondary">
          {theme === 'bridge' ? t('tribute:theme.bridgeDescription') : t('settings:themeHint')}
        </span>
      </label>
    </div>
  );
}
