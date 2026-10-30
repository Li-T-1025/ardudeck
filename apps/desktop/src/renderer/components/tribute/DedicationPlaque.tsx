import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../stores/settings-store';
import { useTributeStore } from '../../stores/tribute-store';

/** Bridge only, and never over flight data: this lives in Settings › About. */
export function DedicationPlaque() {
  const { t } = useTranslation();
  const theme = useSettingsStore((s) => s.theme);
  const openMoment = useTributeStore((s) => s.openMoment);

  if (theme !== 'bridge') return null;

  const display = 'var(--bridge-display, inherit)';

  return (
    <div
      className="rounded-lg p-4 flex flex-col gap-2"
      style={{ background: '#0f1224', border: '1px solid rgba(245,165,36,0.35)' }}
    >
      <span className="text-xs" style={{ fontFamily: display, letterSpacing: '0.14em', color: '#c9b98f' }}>
        {t('tribute:plaque.dedicatedTo')}
      </span>
      <span
        className="font-bold text-white"
        style={{ fontFamily: display, fontSize: 22, letterSpacing: '0.04em' }}
      >
        {t('tribute:plaque.name')}
      </span>
      <span className="text-[13px]" style={{ fontFamily: display, letterSpacing: '0.1em', color: '#c9b98f' }}>
        {t('tribute:plaque.years')}
      </span>
      <button
        onClick={openMoment}
        className="mt-1.5 self-start rounded-full px-4 h-8 text-sm font-bold"
        style={{ background: '#f5a524', color: '#0A0A0F', fontFamily: display, letterSpacing: '0.1em' }}
      >
        {t('tribute:plaque.makeItSo')}
      </button>
    </div>
  );
}
