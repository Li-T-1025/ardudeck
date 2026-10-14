import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { useCameraStore } from '../../../stores/camera-store';
import { mapLayerName } from '../../../../shared/map-layers';
import { SVT_IMAGERY_LAYERS, validImagery } from './svt-satellite';
import { SVT_BUILDING_SOURCES, validBuildings } from './svt-building-sources';

/** Which of the map's satellite layers textures the synthetic-vision terrain. */
export function SvtImageryPicker({ disabled = false }: { disabled?: boolean }) {
  const { t } = useTranslation();
  const imagery = useCameraStore((s) => validImagery(s.svtImagery));
  const setImagery = useCameraStore((s) => s.setSvtImagery);
  return (
    <div className={disabled ? 'pointer-events-none opacity-50' : ''}>
      <div className="px-1.5 pb-0.5 pt-1 text-[10px] uppercase tracking-wide text-content-tertiary">{t('camera:panel.imagerySource')}</div>
      {SVT_IMAGERY_LAYERS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => setImagery(key)}
          className={`flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[11px] transition-colors hover:bg-surface-raised ${imagery === key ? 'text-content' : 'text-content-secondary'}`}
        >
          <Check className={`h-3 w-3 shrink-0 ${imagery === key ? 'text-blue-400' : 'invisible'}`} />
          {mapLayerName(key)}
        </button>
      ))}
    </div>
  );
}

/** Where the synthetic-vision buildings come from; independent of the imagery toggle. */
export function SvtBuildingsPicker() {
  const { t } = useTranslation();
  const buildings = useCameraStore((s) => validBuildings(s.svtBuildings));
  const setBuildings = useCameraStore((s) => s.setSvtBuildings);
  const roofImagery = useCameraStore((s) => s.svtRoofImagery);
  const setRoofImagery = useCameraStore((s) => s.setSvtRoofImagery);
  const satellite = useCameraStore((s) => s.svtSatellite);
  const facades = useCameraStore((s) => s.svtFacades);
  const setFacades = useCameraStore((s) => s.setSvtFacades);
  const off = buildings === 'off';
  return (
    <div>
      <div className="px-1.5 pb-0.5 pt-1 text-[10px] uppercase tracking-wide text-content-tertiary">{t('camera:panel.buildingsSource')}</div>
      {SVT_BUILDING_SOURCES.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => setBuildings(key)}
          data-tip={key === 'off' ? undefined : t(`camera:panel.buildings.${key}Tip`)}
          className={`flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[11px] transition-colors hover:bg-surface-raised ${buildings === key ? 'text-content' : 'text-content-secondary'}`}
        >
          <Check className={`h-3 w-3 shrink-0 ${buildings === key ? 'text-blue-400' : 'invisible'}`} />
          {t(`camera:panel.buildings.${key}`)}
        </button>
      ))}
      <div className={off ? 'pointer-events-none opacity-50' : ''}>
        <label
          className={`flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[11px] hover:bg-surface-raised ${satellite ? 'text-content' : 'text-content-tertiary'}`}
          data-tip={satellite ? undefined : t('camera:panel.roofImageryNeedsSatellite')}
        >
          <input type="checkbox" checked={roofImagery} onChange={(e) => setRoofImagery(e.target.checked)} className="accent-blue-500" />
          {t('camera:panel.roofImagery')}
        </label>
        <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[11px] text-content hover:bg-surface-raised">
          <input type="checkbox" checked={facades} onChange={(e) => setFacades(e.target.checked)} className="accent-blue-500" />
          {t('camera:panel.facades')}
        </label>
      </div>
    </div>
  );
}
