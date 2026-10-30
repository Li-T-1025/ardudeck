import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useTributeStore } from '../../stores/tribute-store';
import { Starfield } from './Starfield';
import { useAnyVehicleArmed } from './useAnyVehicleArmed';

export function DedicationMoment() {
  const { t } = useTranslation();
  const momentOpen = useTributeStore((s) => s.momentOpen);
  const closeMoment = useTributeStore((s) => s.closeMoment);
  const armed = useAnyVehicleArmed();

  useEffect(() => {
    if (momentOpen && armed) closeMoment();
  }, [momentOpen, armed, closeMoment]);

  useEffect(() => {
    if (!momentOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMoment();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [momentOpen, closeMoment]);

  if (!momentOpen || armed) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('tribute:moment.label')}
      className="fixed inset-0 z-[9997] flex items-center justify-center overflow-hidden"
      style={{ background: 'rgba(2,3,10,0.94)' }}
    >
      <Starfield count={90} driftSeconds={30} />

      <div
        className="bridge-rise relative max-w-2xl px-8 text-center flex flex-col items-center gap-5"
        style={{ animation: 'bridge-rise .8s ease-out' }}
      >
        <span
          className="text-sm"
          style={{ fontFamily: 'var(--bridge-display, inherit)', letterSpacing: '0.3em', color: '#b4a7f5' }}
        >
          {t('tribute:moment.release')}
        </span>

        <span
          className="font-bold leading-tight text-white"
          style={{ fontFamily: 'var(--bridge-display, inherit)', fontSize: 46, letterSpacing: '0.04em' }}
        >
          {t('tribute:plaque.name')}
          <br />
          {t('tribute:plaque.years')}
        </span>

        <span className="text-[17px] leading-relaxed" style={{ color: '#d1d5db' }}>
          {t('tribute:banner.title')}
        </span>

        <span className="text-[17px] leading-relaxed" style={{ color: '#d1d5db' }}>
          {t('tribute:moment.legacy')}
        </span>

        <span className="text-[17px]" style={{ color: '#f5a524' }}>
          {t('tribute:moment.thanks')}
        </span>

        <button
          onClick={closeMoment}
          autoFocus
          className="mt-2 rounded-full px-6 h-10 text-sm"
          style={{ border: '1px solid rgba(180,167,245,.5)', color: '#e5e7eb' }}
        >
          {t('tribute:moment.return')}
        </button>
      </div>
    </div>
  );
}
