import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { useOverlayStore } from '../../stores/overlay-store';
import { useMapInstrumentsStore, resolveInstrumentVisible } from '../../stores/map-instruments-store';
import { useActiveVehicleStore } from '../../stores/active-vehicle-store';
import { useLinkUp } from './instruments/useLinkUp';
import { proximityAnyLive } from './proximity-sectors';

const SEEN_KEY = 'proximity-offer-seen';
const PROXIMITY_INSTRUMENT_ID = 'proximity';

function readSeen(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as unknown;
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

function markSeen(vehicleKey: string): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...new Set([...readSeen(), vehicleKey])]));
  } catch {
    // storage blocked: the offer simply shows again next time
  }
}

/** Offers the proximity instrument once per vehicle when its sensor first reports, and switches the map ring on. */
export function ProximityDiscovery(): JSX.Element | null {
  const { t } = useTranslation();
  const linkUp = useLinkUp();
  const vehicleKey = useActiveVehicleStore((s) => s.activeVehicleKey) ?? 'single';
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const proximity = useTelemetryStore((s) => s.proximity);
  const live = proximityAnyLive(proximity, now, linkUp);
  const [offer, setOffer] = useState(false);
  const toggleInstrument = useMapInstrumentsStore((s) => s.toggle);
  const instrumentOn = useMapInstrumentsStore((s) => resolveInstrumentVisible(s.visible, PROXIMITY_INSTRUMENT_ID));

  useEffect(() => {
    if (!live) return;
    const overlays = useOverlayStore.getState();
    const ringOn = overlays.activeOverlays.has('proximity');
    const gaugeOn = resolveInstrumentVisible(useMapInstrumentsStore.getState().visible, PROXIMITY_INSTRUMENT_ID);
    overlays.enableProximityDefault();
    if (!ringOn && !gaugeOn && !readSeen().includes(vehicleKey)) setOffer(true);
  }, [live, vehicleKey]);

  if (!offer) return null;
  const close = () => {
    markSeen(vehicleKey);
    setOffer(false);
  };
  return (
    <div
      data-arrange-chrome
      className="absolute left-1/2 top-12 z-[1100] w-[300px] -translate-x-1/2 rounded-lg border border-subtle bg-surface-solid p-3 text-content shadow-xl"
    >
      <div className="text-[12px] font-semibold">{t('map:proximityDiscovery.title')}</div>
      <div className="mt-1 text-[11px] leading-snug text-content-secondary">{t('map:proximityDiscovery.body')}</div>
      <div className="mt-2.5 flex justify-end gap-2">
        <button
          type="button"
          onClick={close}
          className="rounded px-2 py-1 text-[11px] text-content-secondary transition-colors hover:bg-surface-raised hover:text-content"
        >
          {t('map:proximityDiscovery.dismiss')}
        </button>
        <button
          type="button"
          onClick={() => {
            if (!instrumentOn) toggleInstrument(PROXIMITY_INSTRUMENT_ID);
            close();
          }}
          className="rounded bg-blue-600 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-blue-500"
        >
          {t('map:proximityDiscovery.add')}
        </button>
      </div>
    </div>
  );
}
