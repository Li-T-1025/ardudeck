import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../stores/settings-store';
import { useTributeStore } from '../../stores/tribute-store';
import { useAnyVehicleArmed } from './useAnyVehicleArmed';

export function TributeBanner() {
  const { t } = useTranslation();
  const bannerOpen = useTributeStore((s) => s.bannerOpen);
  const engagedBefore = useTributeStore((s) => s.engagedBefore);
  const onBridge = useSettingsStore((s) => s.theme === 'bridge');
  const engage = useTributeStore((s) => s.engage);
  const dismissBanner = useTributeStore((s) => s.dismissBanner);
  const armed = useAnyVehicleArmed();
  const warping = useTributeStore((s) => s.warping);
  // Engage collapses the banner with the warp; the close button still hides it at once.
  const [leaving, setLeaving] = useState(false);
  const [wasOpen, setWasOpen] = useState(bannerOpen);
  if (bannerOpen !== wasOpen) {
    setWasOpen(bannerOpen);
    if (!bannerOpen && warping) setLeaving(true);
  }
  useEffect(() => {
    if (!leaving) return;
    const id = setTimeout(() => setLeaving(false), 420);
    return () => clearTimeout(id);
  }, [leaving]);

  // Deferred, not dismissed: it returns once everything is disarmed.
  if ((!bannerOpen && !leaving) || armed) return null;

  return (
    <div
      className="grid shrink-0"
      style={{ gridTemplateRows: leaving ? '0fr' : '1fr', opacity: leaving ? 0 : 1, transition: 'grid-template-rows 400ms ease-in-out, opacity 320ms ease-in' }}
    >
    <div className="min-h-0 overflow-hidden">
    <div
      className="tribute-banner shrink-0 flex items-center gap-4 px-4 py-3 border-b"
      style={{ background: '#0b0e1d', borderColor: 'rgba(245,165,36,0.45)' }}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#f5a524"
        strokeWidth={2}
        aria-hidden="true"
        className="flex-shrink-0"
      >
        <path d="M12 2l2.9 6.9 7.1.6-5.4 4.7 1.7 7-6.3-3.9-6.3 3.9 1.7-7L2 9.5l7.1-.6z" />
      </svg>

      <div className="flex flex-col gap-1 min-w-0">
        <span className="text-sm font-semibold text-white">{t('tribute:banner.title')}</span>
        <span className="tribute-banner-body text-xs leading-relaxed" style={{ color: '#a5a3c9' }}>
          {t('tribute:banner.body')}
        </span>
      </div>

      <button
        onClick={engage}
        className="ml-auto flex-shrink-0 rounded-full px-6 h-9 text-base font-bold tracking-widest"
        style={{ background: '#f5a524', color: '#0A0A0F', fontFamily: 'var(--bridge-display, inherit)' }}
      >
        {onBridge ? t('tribute:banner.engaged') : engagedBefore ? t('tribute:banner.engageAgain') : t('tribute:banner.engage')}
      </button>

      <button
        onClick={dismissBanner}
        aria-label={t('tribute:banner.close')}
        className="flex-shrink-0 w-9 h-9 text-xl leading-none"
        style={{ color: '#a5a3c9' }}
      >
        ×
      </button>
    </div>
    </div>
    </div>
  );
}
